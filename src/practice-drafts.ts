import { watch, type Ref } from 'vue'

/** Session-only answers; drafts never count as submitted responses. */
export function usePracticeDrafts(answer: Ref<string>) {
  const drafts = new Map<string, string>()
  let loadedId: string | undefined
  watch(answer, (value) => {
    if (loadedId) drafts.set(loadedId, value)
  }, { flush: 'sync' })

  function load(id?: string, submittedAnswer?: string) {
    // Restoration must not write the previous question's answer into the next one.
    loadedId = undefined
    answer.value = submittedAnswer ?? (id ? drafts.get(id) : undefined) ?? ''
    loadedId = id
  }

  function clear() {
    loadedId = undefined
    drafts.clear()
  }

  return { load, clear, remove: (id: string) => drafts.delete(id) }
}
