/** Close dependent owners in order, attempting every cleanup and preserving the first failure. */
export async function closeOwners(owners: (() => Promise<unknown>)[]) {
  const errors: unknown[] = [];
  for (const close of owners) { try { await close(); } catch (error) { errors.push(error); } }
  if (errors.length) throw errors[0];
}
