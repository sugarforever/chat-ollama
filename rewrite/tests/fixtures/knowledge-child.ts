import { openKnowledge } from "../../src/lib/server/knowledge/index.ts";
const directory = process.env.DATA_DIR!;
const service = openKnowledge({
  directory,
  loadConfig: () => JSON.parse(process.env.EMBEDDING_CONFIG!),
});
if (process.env.CREATE_DOCUMENT === "1") {
  const collection = service.createCollection("Crash recovery");
  const document = await service.upload(
    collection.id,
    "recover.md",
    Buffer.from("Apples grow in the orchard. 苹果在果园里生长。"),
  );
  process.send?.({ collectionId: collection.id, documentId: document.id });
} else {
  await service.idle();
  const collection = service.collections()[0];
  process.send?.({
    documents: service.documents(collection.id),
    hits: await service.searchKnowledgeBases([collection.id], "果园"),
  });
  await service.close();
}
// Keep the create child alive until the test deliberately kills it.
if (process.env.CREATE_DOCUMENT === "1") setInterval(() => {}, 1000);
