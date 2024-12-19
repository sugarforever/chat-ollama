import { ref, type Ref } from 'vue'

export interface Tool {
  type: 'function'
  name: string
  description: string
  parameters?: {
    type: 'object'
    properties: Record<string, {
      type: string
      description: string
    }>
  }
  handler: (args: any) => Promise<any>
}

const globalTools: Ref<Tool[]> = ref([])

export function useTools() {
  const registerTool = (tool: Tool) => {
    console.log('Registering tool:', tool)
    const existingIndex = globalTools.value.findIndex(t => t.name === tool.name)
    if (existingIndex >= 0) {
      globalTools.value[existingIndex] = tool
    } else {
      globalTools.value.push(tool)
    }
  }

  const unregisterTool = (toolName: string) => {
    console.log('Unregistering tool:', toolName)
    const index = globalTools.value.findIndex(t => t.name === toolName)
    if (index >= 0) {
      globalTools.value.splice(index, 1)
    }
  }

  const getTools = () => globalTools.value

  const executeToolHandler = async (toolName: string, args: any) => {
    console.log('Executing tool handler:', toolName, args)
    const tool = globalTools.value.find(t => t.name === toolName)
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`)
    }
    return await tool.handler(args)
  }

  return {
    registerTool,
    unregisterTool,
    getTools,
    executeToolHandler
  }
}
