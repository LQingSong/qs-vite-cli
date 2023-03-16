import fs from "node:fs";
import path from "path";
import prompts from "prompts";
import minimist from "minimist";
import { blue, cyan, green, lightGreen, lightRed, magenta, red, reset, yellow } from "kolorist";

// minimist 命令解析
// 为了避免自动将项目名称参数转换为数字，您可以指定任何与选项未关联的参数应解析为字符串
const argv = minimist<{
  t?: string;
  template?: string;
}>(process.argv.slice(2), { string: ["_"] });

console.log("argv--->", argv);

const defaultTargetDir = "vite-project";

/**
 * 定义模板框架相关的内容
 */

type Framework = {
  name: string;
  display: string;
  color: ColorFunc;
  variants: FrameworkVariant[];
};

// 颜色类型接收 string | number ，最终转成 string
type ColorFunc = (str: string | number) => string;

// 框架变量
type FrameworkVariant = {
  name: string;
  display: string;
  color: ColorFunc;
  customCommand?: string;
};

// 提供的框架
const FRAMEWORKS: Framework[] = [
  {
    name: "vanilla",
    display: "Vanilla",
    color: yellow,
    variants: [],
  },
  {
    name: "vue",
    display: "Vue",
    color: green,
    variants: [
      {
        name: "vue",
        display: "JavaScript",
        color: yellow,
      },
      {
        name: "vue-ts",
        display: "TypeScript",
        color: blue,
      },
      {
        name: "custom-create-vue",
        display: "Customize with create-vue ↗",
        color: green,
        customCommand: "npm create vue@latest TARGET_DIR",
      },
      {
        name: "custom-nuxt",
        display: "Nuxt ↗",
        color: lightGreen,
        customCommand: "npm exec nuxi init TARGET_DIR",
      },
    ],
  },
  {
    name: "react",
    display: "React",
    color: cyan,
    variants: [
      {
        name: "react",
        display: "JavaScript",
        color: yellow,
      },
      {
        name: "react-ts",
        display: "TypeScript",
        color: blue,
      },
      {
        name: "react-swc",
        display: "JavaScript + SWC",
        color: yellow,
      },
      {
        name: "react-swc-ts",
        display: "TypeScript + SWC",
        color: blue,
      },
    ],
  },
  {
    name: "preact",
    display: "Preact",
    color: magenta,
    variants: [
      {
        name: "preact",
        display: "JavaScript",
        color: yellow,
      },
      {
        name: "preact-ts",
        display: "TypeScript",
        color: blue,
      },
    ],
  },
  {
    name: "lit",
    display: "Lit",
    color: lightRed,
    variants: [
      {
        name: "lit",
        display: "JavaScript",
        color: yellow,
      },
      {
        name: "lit-ts",
        display: "TypeScript",
        color: blue,
      },
    ],
  },
  {
    name: "svelte",
    display: "Svelte",
    color: red,
    variants: [
      {
        name: "svelte",
        display: "JavaScript",
        color: yellow,
      },
      {
        name: "svelte-ts",
        display: "TypeScript",
        color: blue,
      },
      {
        name: "custom-svelte-kit",
        display: "SvelteKit ↗",
        color: red,
        customCommand: "npm create svelte@latest TARGET_DIR",
      },
    ],
  },
  {
    name: "others",
    display: "Others",
    color: reset,
    variants: [
      {
        name: "create-vite-extra",
        display: "create-vite-extra ↗",
        color: reset,
        customCommand: "npm create vite-extra@latest TARGET_DIR",
      },
    ],
  },
];

// 从提供的框架里找到 f.name 或者 f.variants 里具有name属性的
// 将找到元素最终合并成数组 [a, b, c...]
// 例如 用户选择了 Vue 这个框架，Vue框架下会提供一些变形，比如 vue-js、vue-ts、custom-create-vue、custom-nuxt
const TEMPLATES = FRAMEWORKS.map((f) => (f.variants && f.variants.map((v) => v.name)) || [f.name]).reduce(
  (a, b) => a.concat(b),
  []
);

// 获取当前执行命令的地址
const cwd = process.cwd();

/**
 * 初始化，完成用户交互获取命令到创建项目模板的过程
 *
 */
async function init() {
  // 取 argv._ 中的第一个字符串作为目标路径
  // 这里就有点小问题了，怎么确保用户输入的第一个数是一个正确的路径呢？
  // argTargetDir 有值就直接退出了
  // argTargetDir 区分大小写， 要求路径是小写的，输入大写的最终路径也会变成小写
  const argTargetDir = formatTargetDir(argv._[0]);
  // 模板的参数命令值
  const argTemplate = argv.template || argv.t;

  let targetDir = argTargetDir || defaultTargetDir;

  const getProjectName = () => (targetDir === "." ? path.basename(path.resolve()) : targetDir);

  console.log("targetDir --->", argTargetDir);

  // result的类型接口限定， 接口定义了哪些类型，prompts里就得写几个步骤, 只能满足不能少，可以多
  let result: prompts.Answers<"projectName" | "overwrite" | "packageName" | "framework" | "variant">;

  // 开始进行命令交互
  try {
    result = await prompts(
      [
        {
          // 目标路径 存在就跳过了，不存在就往下执行，操作类型是text文本类型
          type: argTargetDir ? null : "text",
          // 当前交互操作的name
          name: "projectName",
          // 显示label
          message: "Project name:",
          // 默认展示 vite-project
          initial: defaultTargetDir,
          // Callback for when the state of the current prompt changes.
          onState: (state) => {
            console.log("state ---->", state);
            // state ----> { value: 'vite-project', aborted: false, exited: false }
            targetDir = formatTargetDir(state.value) || defaultTargetDir;
          },
        },
        {
          // 如果 targetDir 不存在或是为空就跳过，否则就要让用户确定是否清空targetDir目录下的内容
          // 例如 先在当前路径下创建testdir(要求路径是小写，因为vite只匹配了小写)，然后执行 node dist/index.js testdir
          // argTargetDir 此时就是 testdir
          // 空的 testdir 直接就跳过了
          // 在 testdir 里创建一个文件让它不为空，此时就会走下面的交互
          type: () => (!fs.existsSync(targetDir) || isEmpty(targetDir) ? null : "confirm"),
          name: "overwrite",
          message: () =>
            (targetDir === "." ? "Current directory" : `Target directory "${targetDir}"`) +
            ` is not empty. Remove existing files and continue?`,
        },
        {
          // type: (_, { overwrite }) 这个地方 prompts 的 type 还需要再理解一下
          type: (_, { overwrite }: { overwrite?: boolean }) => {
            console.log("_ ---->", _);
            console.log("overwrite --->", overwrite);
            if (overwrite === false) {
              throw new Error(red("✖") + " Operation cancelled");
            }
            return null;
          },
          name: "overwriteChecker",
          // 由于安装的声明文件和prompts的版本不一致，2.4.3版本的声明文件message必填，其实这种情况下不必填
          // 这里我就不替换了，记录一下
          message: "",
        },
        // {
        //   type: "text",
        //   name: "test",
        //   message: "测试进入",
        // },
        {
          // 如果 项目名 ProjectName 有效就跳过，否则需要调整一下项目名
          // 处理一些非法的项目名，转成 Github 支持的项目名(标准)
          // 例如执行 node dist/index.js *invalid (无效的路径) 会 reset()
          type: () => (isValidPackageName(getProjectName()) ? null : "text"),
          name: "packageName",
          message: reset("Package name:"),
          // 将 *invalid 经过 toValidPackageName 转成有效的项目名（包名）
          initial: () => toValidPackageName(getProjectName()),
          // validate ?
          validate: (dir) => {
            console.log("dir --->", dir);
            return isValidPackageName(dir) || "Invalid package.json name";
          },
        },
        // 模板选择，重头戏
        {
          // 用户定义了模板并且是内部提供的模板就跳过，否则就需要用户选择一下使用哪个框架
          type: argTemplate && TEMPLATES.includes(argTemplate) ? null : "select",
          name: "framework",
          message:
            typeof argTemplate === "string" && !TEMPLATES.includes(argTemplate)
              ? reset(`"${argTemplate}" isn't a valid template. Please choose from below: `)
              : reset("Select a framework:"),
          // 默认第一项选中
          initial: 0,
          // 选项 { title, value }
          choices: FRAMEWORKS.map((framework) => {
            const frameworkColor = framework.color;
            return {
              title: frameworkColor(framework.display || framework.name),
              value: framework,
            };
          }),
        },
        // 框架变形（细节）
        {
          // 如果上一步选择的框架有变形，那就让用户选择一下使用哪些变形；没有就返回
          type: (framework: Framework) => (framework && framework.variants ? "select" : null),
          name: "variant",
          message: reset("Select a variant:"),
          choices: (framework: Framework) =>
            framework.variants.map((variant) => {
              const variantColor = variant.color;
              return {
                title: variantColor(variant.display || variant.name),
                value: variant.name,
              };
            }),
        },
      ],
      {
        onCancel: () => {
          throw new Error("X" + " Operation cancelled");
        },
      }
    );
  } catch (cancelled: any) {
    console.log(cancelled.message);
    return;
  }

  console.log("user result --->", result);
  // 获取用户的选择，确定用何种框架，是否需要 overwrite 目录， 确定包名 以及使用的一些 '变形'
  const { framework, overwrite, packageName, variant } = result;

  // 当前目录 + targetDir 作为项目的 root 目录
  const root = path.join(cwd, targetDir);

  if (overwrite) {
    // 如果targetDir目录不为空，需要清空
    emptyDir(root);
  } else if (!fs.existsSync(root)) {
    // 如果目标文件夹（目录）不存在，就创建目录
    // 同步创建目录
    fs.mkdirSync(root, { recursive: true });
  }

  // 从 variant || framework.name || argTemplate 确定最终模板 template
  let template: string = variant || framework?.name || argTemplate;
  // 是否是 react swc
  // create-vite 只提供了react + swc
  let isReactSwc = false;

  if (template.includes("-swc")) {
    isReactSwc = true;
    template = template.replace("-swc", "");
  }

  // 通过npm_config_user_agent来获取当前执行的是包管理器的名称和版本
  // 查看用户是通过哪种包管理器 运行我们的脚手架
  // 例如执行 pnpm node dist/index.js
  // npm_config_user_agent===== pnpm/6.32.11 npm/? node/v16.16.0 win32 x64
  const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent);
  // 默认是 'npm'
  const pkgManager = pkgInfo ? pkgInfo.name : "npm";
  // 再验证一下是否是yarn 1.x 版本的
  const isYarn1 = pkgManager === "yarn" && pkgInfo?.version.startsWith("1.");

  // 典型的函数式编程
  // flatMap 数组平展，n维数组变1维，然后找到和template匹配的
  // ?? 如果没有找到，就为 {}
  // const { customCommand } = FRAMEWORKS.flatMap((f) => f.variants).find((v) => v.name === template) ?? {};

  const FRAMEWORKSFlat: FrameworkVariant[] = FRAMEWORKS.flatMap((f) => f.variants);
  console.log(yellow("FRAMEWORKSFlat ====="), FRAMEWORKSFlat);
  // 确定用户选择的模板
  const _TEMPLATE = FRAMEWORKSFlat.find((v) => (v.name = template)) ?? {};
  console.log(red("_TEMPLATE ===="), _TEMPLATE);
  // 需要添加类型断言, 因为 {} 中不存在customCommand,需要添加一个类型断言，告诉编译器该属性存在于_TEMPLATE对象中
  // 如果_TEMPLATE 中不存在customCommand，将被赋值为undefined
  const { customCommand } = _TEMPLATE as { customCommand?: string };

  if (customCommand) {
    const fullCustommand = customCommand
      .replace(/^npm create/, `${pkgManager} create`)
      // 只有 yarn 1.x 不支持 '@veersion' create 命令
      .replace("@latest", () => (isYarn1 ? "" : "@latest"))
      .replace(/^npm exec/, () => {
        if (pkgManager === "pnpm") {
          return "pnpm dlx";
        }
        if (pkgManager === "yarn" && !isYarn1) {
          return "yarn dlx";
        }
        // 其余情况一律按 "npm exec" 处理
        // 包括 yarn 1.x 和 其它 pkgManager
        return "npm exec";
      });
  }
}

/**
 * 获取用户的 userAgent
 * @param userAgent
 * @returns
 */
function pkgFromUserAgent(userAgent: string | undefined) {
  console.log(yellow("env ====="), process.env);
  console.log(red("npm_config_user_agent====="), userAgent);
  if (!userAgent) return undefined;
  const pkgSpec = userAgent.split(" ")[0];
  const pkgSpecArr = pkgSpec.split("/");
  return {
    name: pkgSpecArr[0],
    version: pkgSpecArr[1],
  };
}

/**
 * 清空文件夹目录，保留git文件
 * @param dir
 * @returns
 */
function emptyDir(dir: string) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const file of fs.readdirSync(dir)) {
    if (file === ".git") {
      continue;
    }
    // 强制 递归删除file
    fs.rmSync(path.resolve(dir, file), { recursive: true, force: true });
  }
}

/**
 * 将projectName转成有效的包名
 * @param projectName
 * @returns
 */
function toValidPackageName(projectName: string) {
  /**
   * \s  ->  '-'
   * ^[._] -> ''
   * [^a-z\d\-~]+  -> '-'
   */
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^[._]/, "")
    .replace(/[^a-z\d\-~]+/g, "-");
}

/**
 * 匹配包名是否有效
 * @param projectName
 * @returns
 */
function isValidPackageName(projectName: string) {
  /**
   * ?
   *
   * @ [a-z \d - * ~][a-z \d - *. _ ~]
   *
   * [a-z \d - ~][a-z \d - . _ ~]
   *
   */
  return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(projectName);
}

/**
 * 判断path目录下是否是空文件夹（可以包含.git文件）
 * @param path
 * @returns
 */
function isEmpty(path: string) {
  /**
   * fs.readdirSync(path, options)
   * 同步读取给定path目录得内容，该方法返回一个数组，包含目录中所有文件名或对象。 options参数可用于更改从方法返回文件的格式
   *path:它保存必须从中读取内容的目录路径。它可以是字符串，缓冲区或URL。
    options:它是一个对象，可用于指定将影响方法的可选参数。它具有两个可选参数：
        encoding:它是一个字符串值，该字符串值指定给回调参数指定的文件名使用哪种编码。默认值为“ utf8”。
        withFileTypes:这是一个布尔值，它指定是否将文件作为fs.Dirent对象返回。默认值为“ false”。
    
    返回值：它返回包含目录中文件的String，Buffer或fs.Dirent对象的数组。
   */
  const files = fs.readdirSync(path);
  return files.length === 0 || (files.length === 1 && files[0] === ".git");
}

// /**
//  * 删除路径后的斜杠
//  * @param targetDir
//  * @returns
//  */
function formatTargetDir(targetDir: string | undefined) {
  /**
   * 从 targeteDir 从字符串的末尾删除所有连续的斜杠字符（/）。具体来说，它使用了以下几个元素：
        /：正则表达式的开始和结束标记。
        /：转义字符，表示匹配斜杠字符本身。
        +：匹配前面的字符或组合至少一次。
        $：匹配字符串的结尾。
    因此，//+$/g 表示要匹配一个或多个斜杠字符，并且必须出现在字符串的末尾。最后的 g 标志表示全局匹配，即匹配到所有符合条件的地方。然后，这个表达式可以被传递给 JavaScript 的 replace() 方法来替换所有匹配的字符为空字符串，从而实现删除操作。
   */
  return targetDir?.trim().replace(/\/+$/g, "");
}

// init中涉及一些异步操作
init().catch((e) => {
  console.log(e);
});
