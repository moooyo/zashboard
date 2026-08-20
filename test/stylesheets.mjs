/*
 * 样式树的读取助手（非测试文件，`node --test test/*.test.mjs` 不会当用例跑）。
 *
 * 上游把原来的单文件 framework.css 拆成了 theme/ base/ components/ utilities/ 四层，
 * 而且还会继续拆。样式相关的边界断言因此一律面向整棵树而不是某一个文件：
 * 声明只要存在就算数，写在哪个分片里不重要 —— 上游再挪一次也不会把边界悄悄放过去。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const stylesRoot = fileURLToPath(new URL('../src/assets/styles/', import.meta.url))
const entryPoint = fileURLToPath(new URL('../src/assets/main.css', import.meta.url))

/** 全部样式表拼成一段文本，路径序固定，便于对声明顺序做断言。 */
export const allStylesheets = () => {
  const files = readdirSync(stylesRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()

  return [entryPoint, ...files].map((file) => readFileSync(file, 'utf8')).join('\n')
}
