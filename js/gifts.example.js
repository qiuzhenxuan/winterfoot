// =====================================================================
//  生日礼物配置（公开示例版）
//  · 想做自己的版本：把本文件复制为 js/gifts.js 再修改；js/gifts.js 和 assets/gifts/ 不会被提交到 git
//  · js/gifts.js 存在时优先使用它，否则使用本示例
//  · 文字里的 {name} 会自动替换成 recipientName，{from} 替换成 senderName
//  · 图片放进 assets/gifts/ 后，把下面的 src 改成对应文件名即可（png / jpg / webp 都行）
//  · 想让对方从头体验：地址后面加 ?reset=1 ，或在「? 帮助」里点「重新开始生日之旅」
// =====================================================================

export const BIRTHDAY = {
  recipientName: "小伙伴", // TA 的名字 / 昵称
  senderName: "一位老朋友", // 你的落款
  candles: 5, // 蛋糕上的蜡烛数量（1–12，太多会挤，建议用年龄的个位或干脆 1 根）
  // 对话框右侧的头像：可以换成你的像素头像 / 照片，例如 "./assets/gifts/me.png"；留空则显示表情
  portrait: "",
  portraitEmoji: "🦀",

  // 开场标题画面
  titleLine: "冬麓",
  titleSub: "送给 {name} 的生日礼物",

  // 开场对话（点击 / 空格 / E 翻页）
  intro: [
    "{name}，生日快乐！欢迎来到冬麓小屋。",
    "这是我给你搭的一个小小的冬天：菜田、牧场、桥那头篝火边的小螃蟹……都可以慢慢逛。",
    "不过最重要的东西，都藏在小屋里。右上角有一张「生日清单」，跟着它走就好。",
  ],

  // 吹蜡烛前的许愿提示
  wishPrompt: "闭上眼睛，许一个愿望吧……",
  wishDone: "愿望已经悄悄收好啦。生日快乐，{name}！",

  // 清单全部完成后的结尾对话（之后会放烟花）
  finale: [
    "你找到了我藏在冬麓里的所有东西。",
    "谢谢你又陪我走过了一年。愿新的一岁，像小屋的炉火一样，一直暖暖的。",
    "生日快乐，{name}。—— {from}",
  ],
};

// 礼物盒里的画册（建议 3–8 张）。每张第一次看到时都要「撕开包装纸」才能看见。
export const GIFT_GALLERY_ITEMS = [
  {
    id: "gift-1",
    src: "./moments/01-黄昏冬麓全景.png",
    title: "第一份 · 黄昏的山谷",
    date: "生日礼物 · 01",
    caption: "换成你自己的照片：放进 assets/gifts/，再改这里的 src。",
  },
  {
    id: "gift-2",
    src: "./moments/02-暮色拱桥与Claude小螃蟹.png",
    title: "第二份 · 桥边的小螃蟹",
    date: "生日礼物 · 02",
    caption: "每张图第一次打开时都要先撕开包装纸。",
  },
  {
    id: "gift-3",
    src: "./moments/04-黄昏菜园与动物牧场.png",
    title: "第三份 · 菜园和牧场",
    date: "生日礼物 · 03",
    caption: "建议放 3–8 张。",
  },
];

// 书桌上的火漆信。手写信拍照后放进 assets/gifts/，pages 里按顺序写多页即可。
export const LETTER_CONTENT = {
  title: "书桌上的火漆信",
  subtitle: "点击信纸可以放大阅读", // 多页时会自动加上「◀ ▶ 翻页」提示
  pages: ["./moments/03-暖屋壁炉橘猫室内.png"],
};

// 门口信箱：每天早上送来一封（睡一觉 = 进入下一天）。day 表示第几天起可以收到。
// 想写几封都可以；读完后信箱会显示「暂时没有新信」。
export const MAILBOX_LETTERS = [
  {
    day: 1,
    title: "冬麓的第一封信",
    text: "{name}：\n\n欢迎住进冬麓小屋！\n门口这个信箱每天早上都会收到一封新信。\n回屋里的床上睡一觉，明天再来看看吧。",
  },
  {
    day: 2,
    title: "早安",
    text: "早上好呀，{name}。\n\n昨晚的雪下得很大，你睡得还好吗？\n悄悄告诉你：小屋里藏着一些惊喜，\n有的在显眼的地方，有的要你凑近了才能发现。\n\n今天不着急出门的话，就在屋里多转转吧。",
  },
  {
    day: 3,
    title: "关于冬麓的夜空",
    text: "{name}：\n\n听说冬麓的夜里会有极光，\n不过据说只有百分之零点一的人能碰上。\n\n今晚天黑以后，记得抬头看看北边的天空。\n要是真的看到了，那你一定就是那个幸运的人。",
  },
  {
    day: 4,
    title: "最后一封",
    text: "{name}：\n\n这是信箱里的最后一封信了。\n不管你什么时候回到这里，小屋的炉火都会为你亮着。\n\n生日快乐。",
  },
];

// 吹完蜡烛以后，和小动物（牛、羊、鸡、兔子、小猫、小螃蟹）互动时会冒出来的祝福，按顺序轮流出现
export const ANIMAL_BLESSINGS = [
  "{name}，生日快乐！",
  "愿你新的一岁，遇见更漂亮的风景",
  "平安顺遂，每天都有开心的瞬间",
  "愿你一直自由，无忧无虑",
  "愿你遇到的都是善意",
  "愿你永远忠于自己",
  "被一场好看的晚霞治愈吧",
  "愿你往后越来越好",
  "今天也要被温柔以待呀",
  "{name}，新的一岁也要闪闪发光",
];

export function fillBirthdayText(str) {
  return String(str || "")
    .replaceAll("{name}", BIRTHDAY.recipientName)
    .replaceAll("{from}", BIRTHDAY.senderName);
}
