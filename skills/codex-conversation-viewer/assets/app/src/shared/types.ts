export type ThreadSummary = {
  id: string;
  title: string;
  sourcePath: string;
  createdAt?: string;
  updatedAt?: string;
  parseStatus: 'ok' | 'error';
  parseError?: string;
  turnCount?: number;
};

export type ConversationTurn = {
  id: string;
  threadId: string;
  userText: string;
  assistantText?: string;
  userCreatedAt?: string;
  assistantCreatedAt?: string;
  sourcePath: string;
  sourceOffsets?: {
    user?: number;
    assistant?: number;
  };
};
