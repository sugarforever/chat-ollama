import { LazyUModal, LazyUCard, LazyUButton } from '#components'
import type { PropType, VNode, Component } from 'vue'

interface Options {
  title?: string
  cancelText?: string
  confirmText?: string
  preventClose?: boolean
  component?: Component
  dangerouslyUseHTMLString?: boolean
}

export function useDialog(type: 'modal' | 'confirm' | 'alert') {
  const { t } = useI18n()
  const modal = useModal()

  const TheConfirm = defineComponent({
    name: 'TheConfirm',
    props: {
      title: {
        type: String,
        default: t('global.confirmTitle'),
      },
      description: {
        type: String as PropType<string | VNode>,
        required: true,
      },
      confirmText: {
        type: String,
        default: t('global.confirmText'),
      },
      cancelText: {
        type: String,
        default: t('global.cancelText'),
      },
      onClose: {
        type: Function,
        default: () => { },
      },
      onDone: {
        type: Function,
        default: () => { },
      },
      preventClose: {
        type: Boolean,
        default: false,
      },
      component: {
        type: Object as PropType<Component>
      },
      dangerouslyUseHTMLString: {
        type: Boolean,
        default: false
      },
    },
    setup(props) {
      return () => h(LazyUModal, { preventClose: props.preventClose }, {
        default: () => [
          h(LazyUCard, {}, {
            header: () => h('div', { class: 'flex items-center justify-between' }, [
              h('h2', { class: 'text-lg font-bold' }, props.title),
              h(LazyUButton, {
                icon: 'i-material-symbols-close-rounded',
                color: 'gray',
                onClick: props.onClose,
                onTouchstart: (e: TouchEvent) => {
                  e.stopPropagation()
                  props.onClose()
                },
              })
            ]),
            default: props.component
              ? h(props.component, { close: () => props.onClose() })
              : () => props.dangerouslyUseHTMLString
                ? h('div', { innerHTML: props.description })
                : h('div', [props.description]),
            footer: type === 'modal'
              ? undefined
              : () => h('div', { class: 'flex justify-end gap-2' }, [
                type === 'confirm'
                  ? h(LazyUButton, {
                    color: 'gray',
                    class: 'mr-2',
                    onClick: props.onClose,
                    onTouchstart: (e: TouchEvent) => {
                      e.stopPropagation()
                      props.onClose()
                    },
                  }, { default: () => props.cancelText })
                  : null,
                h(LazyUButton, {
                  onClick: props.onDone,
                  onTouchstart: (e: TouchEvent) => {
                    e.stopPropagation()
                    props.onDone()
                  },
                }, { default: () => props.confirmText }),
              ])
          })
        ]
      })
    }
  })

  return async function dialog(description: string | VNode, config?: Options | string) {
    if (typeof config === 'string') {
      config = {
        title: config,
      }
    }
    return new Promise((resolve, reject) => {
      modal.open(TheConfirm, {
        ...config,
        description,
        onClose: () => {
          reject('canceled')
          modal.close()
        },
        onDone: () => {
          resolve(true)
          modal.close()
        }
      })
    })
  }
}
