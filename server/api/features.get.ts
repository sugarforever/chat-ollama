export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // Debug logging
  console.log('Environment variables:')
  console.log('MCP_ENABLED:', process.env.MCP_ENABLED)
  console.log('KNOWLEDGE_BASE_ENABLED:', process.env.KNOWLEDGE_BASE_ENABLED)
  console.log('REALTIME_CHAT_ENABLED:', process.env.REALTIME_CHAT_ENABLED)
  console.log('MODELS_MANAGEMENT_ENABLED:', process.env.MODELS_MANAGEMENT_ENABLED)

  console.log('Runtime config:')
  console.log('mcpEnabled:', config.mcpEnabled)
  console.log('knowledgeBaseEnabled:', config.knowledgeBaseEnabled)
  console.log('realtimeChatEnabled:', config.realtimeChatEnabled)
  console.log('modelsManagementEnabled:', config.modelsManagementEnabled)

  return {
    success: true,
    data: {
      knowledgeBaseEnabled: Boolean(config.knowledgeBaseEnabled),
      realtimeChatEnabled: Boolean(config.realtimeChatEnabled),
      modelsManagementEnabled: Boolean(config.modelsManagementEnabled),
      mcpEnabled: Boolean(config.mcpEnabled)
    }
  }
})
