import { createFilesSpanExporterFromRuntimeEnv } from '@agentpond/files-sdk/otel'
import { LangChainInstrumentation } from '@arizeai/openinference-instrumentation-langchain'
import * as CallbackManagerModule from '@langchain/core/callbacks/manager'
import { NodeSDK } from '@opentelemetry/sdk-node'

let agentPondSdk: NodeSDK | undefined

const shutdownAgentPond = async () => {
  const sdk = agentPondSdk
  agentPondSdk = undefined

  if (!sdk) {
    return
  }

  try {
    await sdk.shutdown()
  } catch {
    console.warn('AgentPond tracing shutdown failed')
  }
}

export default defineNitroPlugin(async (nitroApp) => {
  if (!process.env.FILES_SDK_PROVIDER) {
    return
  }

  const instrumentation = new LangChainInstrumentation({
    traceConfig: {
      hideInputs: true,
      hideOutputs: true,
    },
  })
  const sdk = new NodeSDK({
    traceExporter: createFilesSpanExporterFromRuntimeEnv(),
    instrumentations: [instrumentation],
  })

  try {
    sdk.start()
    instrumentation.manuallyInstrument(CallbackManagerModule)
    agentPondSdk = sdk
    nitroApp.hooks.hookOnce('close', shutdownAgentPond)
  } catch {
    await sdk.shutdown().catch(() => undefined)
    console.warn('AgentPond tracing initialization failed; tracing is disabled')
  }
})
