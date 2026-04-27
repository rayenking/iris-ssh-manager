export type AuthMethod = 'password' | 'publicKey' | 'agent';

export interface Connection {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  privateKeyPath?: string;
  groupId?: string;
  colorTag?: string;
  startupCommand?: string;
  lastConnectedAt?: string;
  connectionCount: number;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionGroup {
  id: string;
  name: string;
  color?: string;
  parentId?: string;
  sortOrder?: number;
}

export interface CreateConnectionInput {
  name: string;
  hostname: string;
  port?: number;
  username: string;
  authMethod: AuthMethod;
  privateKeyPath?: string;
  groupId?: string;
  colorTag?: string;
  startupCommand?: string;
}

export interface UpdateConnectionInput extends Partial<CreateConnectionInput> {}

export interface CreateGroupInput {
  name: string;
  color?: string;
  parentId?: string;
}

export interface UpdateGroupInput extends Partial<CreateGroupInput> {}
