export type TransformTypes<T extends string> = {
  [P in T]: P extends `${infer A}.${infer B}`
  ? B extends 'proxy' ? boolean : string
  : string
}

export type PickupPathKey<
  T extends Record<string, any>,
  K extends (string | null) = null,
  M = keyof T
> = M extends string
  ? (T[M] extends Record<string, any>
    ? PickupPathKey<T[M], (K extends string ? `${K}.${M}` : M)>
    : (K extends null ? M : `${K}.${M}`))
  : K
