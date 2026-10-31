export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function validateConversationId(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new ApiError(400, 'INVALID_ID', 'Invalid conversation ID');
}
