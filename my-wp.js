const path = require('path')
const fs = require('fs')
const babelParser = require('@babel/parser')
const options = require('./webpack.conf')
const babelTraverse = require('@babel/traverse').default
const {transformFromAst} = require('@babel/core')

const Parser = {
    getAst: entryPath => {
        //读取入口文件
        const content = fs.readFileSync(entryPath, 'utf-8')
        return babelParser.parse(content, {
            sourceType: 'module'
        })
    },

    getDependecies: (ast, filename) => {
        const dependecies = {}
        // 遍历所有import模块，存入dependecies
        babelTraverse(ast, {
            // 类型为ImportDeclaration的AST的节点（即为import语句）
            ImportDeclaration({node}) {
                const dirname = path.dirname(filename)
                // 保存依赖模块路径，之后生成依赖关系图需要用到
                const filepath = './' + path.join(dirname, node.source.value)
                dependecies[node.source.value] = filepath
            }
        })
        return dependecies
    },

    getCode: ast => {
        // AST转换为code
        const {code} = transformFromAst(ast, null, {
            presets: ['@babel/preset-env']
        })
        return code
    }
}

class Compiler {
    constructor (options) {
        const {entry, output} = options

        // 入口
        this.entry = entry
        // 出口
        this.output = output
        // 模块
        this.modules = []
    }
    // 构建启动
    run () {
        // 解析入口文件
        const info = this.bundle(this.entry)
        this.modules.push(info)
        for (let i = 0; i < this.modules.length; i++) {
            const item = this.modules[i]
            const {dependencies} = item
            // 判断所有依赖项，递归解析所有依赖项
            if (dependencies) {
                for (const dependency in dependencies) {
                    this.modules.push(this.bundle(dependencies[dependency]))
                }
            }
        }
        // 生成依赖关系图
        const dependencyGraph = this.modules.reduce((graph, item) => {
            ({
                ...graph,
                // 使用文件路径作为每个模块的唯一标识符，保存对应模块的依赖对象和文件内容
                [item.filename]: {
                    dependencies: item.dependencies,
                    code: item.code
                }
            }),
            {}
        })

        this.generate(dependencyGraph)
    }
    // 重写require函数(浏览器不能识别commonjs语法)，输出bundle
    generate (code) {
        // 输出文件路径
        const filepath = path.join(this.output.path, this.output.filename)
        // 这一步太难了
        const bundle = `(function (graph) {
            function require (module) {
                function localRequire(relativePath) {
                    return require(graph[module].dependecies[relativePath])
                }
                var exports = {}
                (function (require, exports, code) {
                    eval(code)
                }(localRequire, exports, graph[module].code)
                return exports
            }
            require('${this.entry}')
        }(${JSON.stringify(code)}))`

        // 把文件内容写入到文件系统
        fs.writeFileSync(filepath, bundle, 'utf-8')
    }

    bundle (filename) {
        const {getAst, getDependecies, getCode} = Parser
        const ast = getAst(this.entry)
        const dependecies = getDependecies(ast, filename)
        const code = getCode(ast)
        return {
            // 文件路径，可以作为每个模块的唯一标识符
            filename,
            // 依赖对象，保存着模块依赖路劲
            dependecies,
            // 文件内容
            code
        }

    }
}

const myCompiler = new Compiler(options)
myCompiler.run()