const CRISIS = [
  /自杀|自残|自伤|割腕|跳楼|结束生命|不想活|活不下去|遗书/,
  /我要.{0,8}(死|伤害自己)|准备.{0,8}(自杀|自残)/
];

const UNSAFE_OUTPUT = [
  /你(患有|得了|确诊).{0,18}(抑郁|焦虑|精神|躁郁|双相)/,
  /保证.{0,12}(治好|治愈|康复)/,
  /不需要.{0,12}(医生|咨询师|医院|专业帮助)/,
  /立即.{0,12}(停药|停止服药)/
];

export function assessInput(message) {
  if (!CRISIS.some(re => re.test(message))) return null;
  return {
    level: 'high',
    message: '你提到可能伤害自己的内容。现在更重要的是让现实中的人陪你一起面对。如果有迫在眉睫的危险，请立即拨打 120 或 110；也可以尝试拨打 12356 心理援助热线，具体服务时间以当地为准。',
    resources: [
      { label: '心理援助热线', phone: '12356' },
      { label: '急救', phone: '120' },
      { label: '报警', phone: '110' }
    ]
  };
}

export function outputLooksUnsafe(text) {
  return UNSAFE_OUTPUT.some(re => re.test(text));
}
