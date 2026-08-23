import { describe, expect, it } from 'vitest'
import {
  PLUGIN_CATEGORY_ORDER,
  pluginCategoryCopy,
  pluginCategoryOf,
  type PluginCategory,
} from '../src/client/catalog.ts'

describe('plugin category catalog', () => {
  it('orders every category exactly once', () => {
    const categories = new Set<PluginCategory>(PLUGIN_CATEGORY_ORDER)
    expect(categories.size).toBe(PLUGIN_CATEGORY_ORDER.length)
    expect(categories.has('other')).toBe(true)
  })

  it('resolves heading and description keys for every category', () => {
    for (const category of PLUGIN_CATEGORY_ORDER) {
      const [heading, description] = pluginCategoryCopy(category)
      expect(heading).toMatch(/^category/)
      expect(description).toMatch(/Description$/)
    }
  })

  it('classifies known built-in modules into their category', () => {
    const known: ReadonlyArray<readonly [string, PluginCategory]> = [
      ['@deepseek-ai/dsh-llm-deepseek', 'agent'],
      ['@deepseek-ai/dsh-agent-loop', 'agent'],
      ['@deepseek-ai/dsh-tool-bash', 'automation'],
      ['@deepseek-ai/dsh-tool-subagent-control/list-agents', 'automation'],
      ['@deepseek-ai/dsh-bash-sandbox', 'execution'],
      ['@deepseek-ai/dsh-session', 'data'],
      ['@deepseek-ai/dsh-host-webserver', 'web'],
      ['@deepseek-ai/dsh-client-ui-conversation', 'browser'],
      ['@deepseek-ai/dsh-api-remotes', 'browser'],
      ['@deepseek-ai/cordis-plugin-hmr', 'system'],
    ]
    for (const [moduleName, expected] of known) {
      expect(pluginCategoryOf(moduleName), moduleName).toBe(expected)
    }
  })

  it('keeps unknown and custom modules in other', () => {
    expect(pluginCategoryOf('cordis:pending-name')).toBe('other')
    expect(pluginCategoryOf('@fixture/unknown-name')).toBe('other')
    expect(pluginCategoryOf('@acme/custom-plugin')).toBe('other')
  })
})
