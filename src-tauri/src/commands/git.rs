use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

const MAX_DIFF_BYTES: usize = 300_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    path: String,
    status: String,
    staged: bool,
    added_lines: usize,
    removed_lines: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResponse {
    repo_root: String,
    branch: Option<String>,
    files: Vec<ChangedFile>,
    added_lines: usize,
    removed_lines: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResponse {
    path: String,
    diff: String,
    is_binary: bool,
    too_large: bool,
}

#[tauri::command]
pub async fn get_git_repo_root(cwd: String) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || find_repo_root_output(&cwd))
        .await
        .map_err(|error| format!("failed to join git repo root task: {error}"))?
}

#[tauri::command]
pub async fn get_git_status(cwd: String) -> Result<GitStatusResponse, String> {
    tokio::task::spawn_blocking(move || load_git_status(&cwd))
        .await
        .map_err(|error| format!("failed to join git status task: {error}"))?
}

#[tauri::command]
pub async fn get_git_diff(cwd: String, file_path: String) -> Result<GitDiffResponse, String> {
    tokio::task::spawn_blocking(move || load_git_diff(&cwd, &file_path))
        .await
        .map_err(|error| format!("failed to join git diff task: {error}"))?
}

fn load_git_status(cwd: &str) -> Result<GitStatusResponse, String> {
    let repo_root = find_repo_root(cwd)?;
    let branch = run_git(repo_root.as_path(), ["branch", "--show-current"]).ok();
    let status_output = run_git(repo_root.as_path(), ["status", "--porcelain=v1"])?;
    let numstat_output = run_git(repo_root.as_path(), ["diff", "--numstat", "--cached", "--no-ext-diff"]).unwrap_or_default();
    let unstaged_numstat_output = run_git(repo_root.as_path(), ["diff", "--numstat", "--no-ext-diff"]).unwrap_or_default();

    let staged_per_file = parse_numstat_per_file(&numstat_output);
    let unstaged_per_file = parse_numstat_per_file(&unstaged_numstat_output);

    let mut files = Vec::new();
    for line in status_output.lines().filter(|line| !line.trim().is_empty()) {
        if line.len() < 4 {
            continue;
        }

        let bytes = line.as_bytes();
        let index_status = bytes[0] as char;
        let worktree_status = bytes[1] as char;
        let raw_path = line[3..].trim();
        let path = if matches!(index_status, 'R' | 'C') || matches!(worktree_status, 'R' | 'C') {
            raw_path.rsplit(" -> ").next().unwrap_or(raw_path).to_string()
        } else {
            raw_path.to_string()
        };
        let status = map_status(index_status, worktree_status).to_string();
        let staged = index_status != ' ' && index_status != '?';

        let (sa, sr) = staged_per_file.get(path.as_str()).copied().unwrap_or((0, 0));
        let (ua, ur) = unstaged_per_file.get(path.as_str()).copied().unwrap_or((0, 0));

        files.push(ChangedFile { path, status, staged, added_lines: sa + ua, removed_lines: sr + ur });
    }

    let (staged_added_lines, staged_removed_lines) = parse_numstat(&numstat_output);
    let (unstaged_added_lines, unstaged_removed_lines) = parse_numstat(&unstaged_numstat_output);
    let added_lines = staged_added_lines + unstaged_added_lines;
    let removed_lines = staged_removed_lines + unstaged_removed_lines;

    Ok(GitStatusResponse {
        repo_root: repo_root.to_string_lossy().into_owned(),
        branch: branch.filter(|value| !value.is_empty()),
        files,
        added_lines,
        removed_lines,
    })
}

fn load_git_diff(cwd: &str, file_path: &str) -> Result<GitDiffResponse, String> {
    let repo_root = find_repo_root(cwd)?;
    let staged = run_git(repo_root.as_path(), ["diff", "--cached", "--no-ext-diff", "--", file_path]).unwrap_or_default();
    let unstaged = run_git(repo_root.as_path(), ["diff", "--no-ext-diff", "--", file_path]).unwrap_or_default();

    let mut sections = Vec::new();
    if !staged.trim().is_empty() {
        sections.push(staged);
    }
    if !unstaged.trim().is_empty() {
        sections.push(unstaged);
    }

    if sections.is_empty() {
        let full_path = repo_root.join(file_path);
        if full_path.exists() && full_path.is_file() {
            if let Ok(untracked) = run_git_allow_exit_code(repo_root.as_path(), ["diff", "--no-index", "--no-ext-diff", "--", "/dev/null", file_path]) {
                if !untracked.trim().is_empty() {
                    sections.push(untracked);
                }
            }
        }
    }

    let diff = sections.join("\n\n");
    let is_binary = diff.contains("Binary files") || diff.contains("GIT binary patch");
    let too_large = diff.len() > MAX_DIFF_BYTES;

    Ok(GitDiffResponse {
        path: file_path.to_string(),
        diff: if too_large { String::new() } else { diff },
        is_binary,
        too_large,
    })
}

fn find_repo_root(cwd: &str) -> Result<PathBuf, String> {
    let output = find_repo_root_output(cwd)?
        .ok_or_else(|| format!("no git repository found from {cwd}"))?;
    Ok(PathBuf::from(output))
}

fn find_repo_root_output(cwd: &str) -> Result<Option<String>, String> {
    match run_git(resolve_local_path(cwd)?.as_path(), ["rev-parse", "--show-toplevel"]) {
        Ok(output) if !output.is_empty() => Ok(Some(output)),
        Ok(_) => Ok(None),
        Err(_) => Ok(None),
    }
}

fn run_git<I, S>(cwd: &Path, args: I) -> Result<String, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|error| format!("failed to run git in {}: {error}", cwd.display()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("git command failed in {}", cwd.display())
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn run_git_allow_exit_code<I, S>(cwd: &Path, args: I) -> Result<String, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|error| format!("failed to run git in {}: {error}", cwd.display()))?;

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn resolve_local_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("path is empty".to_string());
    }

    let candidate_path = PathBuf::from(trimmed);
    if candidate_path.is_absolute() {
        Ok(candidate_path)
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(candidate_path))
            .map_err(|error| format!("failed to resolve path {trimmed}: {error}"))
    }
}

fn parse_numstat(output: &str) -> (usize, usize) {
    output
        .lines()
        .fold((0_usize, 0_usize), |(added_total, removed_total), line| {
            let mut parts = line.split_whitespace();
            let added = parts.next().and_then(|value| value.parse::<usize>().ok()).unwrap_or(0);
            let removed = parts.next().and_then(|value| value.parse::<usize>().ok()).unwrap_or(0);
            (added_total + added, removed_total + removed)
        })
}

fn parse_numstat_per_file(output: &str) -> HashMap<&str, (usize, usize)> {
    let mut map = HashMap::new();
    for line in output.lines() {
        let mut parts = line.split('\t');
        let added = parts.next().and_then(|v| v.parse::<usize>().ok()).unwrap_or(0);
        let removed = parts.next().and_then(|v| v.parse::<usize>().ok()).unwrap_or(0);
        if let Some(path) = parts.next() {
            let entry = map.entry(path).or_insert((0_usize, 0_usize));
            entry.0 += added;
            entry.1 += removed;
        }
    }
    map
}

fn map_status(index_status: char, worktree_status: char) -> &'static str {
    if index_status == '?' || worktree_status == '?' {
        return "??";
    }

    for status in [index_status, worktree_status] {
        match status {
            'M' => return "M",
            'A' => return "A",
            'D' => return "D",
            'R' => return "R",
            'C' => return "C",
            _ => {}
        }
    }

    "M"
}
