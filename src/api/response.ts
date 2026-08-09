export type ResponseLike<T = unknown> = {
  status?: number
  data?: T
  message?: string
  response?: {
    status?: number
    data?: T
  }
}

export const responseStatus = (value: unknown) => {
  const response = value as ResponseLike
  return response.status ?? response.response?.status ?? 0
}

export const responseData = <T>(value: unknown) => {
  const response = value as ResponseLike<T>
  return response.data ?? response.response?.data
}

export const responseMessage = (value: unknown) => {
  const response = value as ResponseLike<{ message?: string }>
  return responseData<{ message?: string }>(response)?.message ?? response.message ?? ''
}
