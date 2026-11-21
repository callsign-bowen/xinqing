export type ScenarioDifficulty = 'gentle' | 'realistic' | 'tough'

export type ScenarioCategory =
  | 'family'
  | 'work'
  | 'intimacy'
  | 'friend'
  | 'self'
  | 'consumer'
  | 'care'
  | 'digital'

export interface Scenario {
  id: string
  category: ScenarioCategory
  subcategory: string
  title: string
  oneLine: string
  counterpartRole: string
  context: string
  goal: string
  openings: Record<ScenarioDifficulty, string>
  styles: Record<ScenarioDifficulty, string>
  avoid: string[]
  debriefFocus: string[]
}

export const DIFFICULTY_LABELS: Record<ScenarioDifficulty, string> = {
  gentle: '温和',
  realistic: '真实',
  tough: '难缠'
}

export const DIFFICULTY_HINTS: Record<ScenarioDifficulty, string> = {
  gentle: '对方较愿意听，也有自己的顾虑；有具体信息时更容易商量。适合先练“敢开口”。',
  realistic: '对方有自己的压力和利益，会针对你的说法回应。适合练“不被带走”。',
  tough: '对方会施压、否定、转移责任，但不辱骂、不威胁。适合练“守住边界”。'
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'work-raise',
    category: 'work',
    subcategory: '谈薪',
    title: '跟领导提加薪',
    oneLine: '把“我想要”说出口，不被“再等等”打发。',
    counterpartRole: '直属领导',
    context: '你在这家公司做了两年，负责的项目从 2 个变成 5 个。领导很忙，习惯先否定，再给一个模糊承诺。',
    goal: '把加薪说出口，并拿到一个具体时间点。',
    openings: {
      gentle: '你想聊什么？我听着。',
      realistic: '现在？我一会儿还有个会。你说吧。',
      tough: '加薪？公司现在什么情况你不知道吗？先把手头的事做好。'
    },
    styles: {
      gentle: '说话平和，重视实际工作依据；信息含糊时会核对，依据具体时较愿意商量可行的下一步，不作超出已知权限的保证。',
      realistic: '忙、谨慎，关注成本和项目交付，习惯先压低预期；笼统要求可能让他拖延，具体职责变化或低成本核对方案会使他回应实质内容。语气简洁，不固定打断或重复同一理由。',
      tough: '防御心较强，重视成本和管理权，可能质疑贡献；面对具体依据需要回应，拒绝也针对当前提议说明顾虑，不贬低人格、不用失业施压。'
    },
    avoid: ['不辱骂', '不威胁', '不提裁员/失业恐吓'],
    debriefFocus: ['有没有把加薪说出口', '有没有被“再等等”带走', '有没有要到具体时间']
  },
  {
    id: 'work-blame',
    category: 'work',
    subcategory: '甩锅',
    title: '拒绝同事甩锅',
    oneLine: '把责任边界说清楚，不接不属于你的锅。',
    counterpartRole: '同事',
    context: '项目出了问题，同事在群里说“这部分一直是你在跟”，但这块其实不是你负责。',
    goal: '把事实和责任边界说清楚，不替对方背锅。',
    openings: {
      gentle: '这个部分不是你做的吗？我有点记不清了。',
      realistic: '群里都在问，你先帮忙认一下，回头再说。',
      tough: '这点事你都不肯担？以后还怎么合作。'
    },
    styles: {
      gentle: '愿意核对事实，说话较克制；分工清楚时可以承认理解有误，证据不够时会说明自己哪里不确定。',
      realistic: '怕被追责，想先缓解眼前压力，说话容易含糊；用户泛泛拒绝时可能推回去，拿出分工依据时会核对或解释自己的理解，不捏造用户失误。',
      tough: '较强势，看重自己不被追责，可能借合作要求施压；用户守住事实边界时需要回应证据与后果，不固定甩同一句话，不辱骂或威胁。'
    },
    avoid: ['不辱骂', '不威胁', '不捏造你的失误'],
    debriefFocus: ['有没有说清“不是我负责”', '有没有被“团队”带走', '有没有给出下一步']
  },
  {
    id: 'family-marriage',
    category: 'family',
    subcategory: '催婚',
    title: '妈妈催婚',
    oneLine: '把自己的想法说清楚，不被催着走。',
    counterpartRole: '妈妈',
    context: '过年回家，妈妈又开始催婚，说别人家孩子都结婚了，你再挑就来不及了。',
    goal: '把自己的想法说清楚，不被催着做决定。',
    openings: {
      gentle: '我不是逼你，就是问问。你到底怎么想的？',
      realistic: '你看人家都结婚了，你到底什么时候定下来？',
      tough: '你再这么挑下去，以后谁还要你？我这是为你好。'
    },
    styles: {
      gentle: '担心孩子未来，说话带关心也有自己的期待；听到具体打算时愿意听，仍不放心时会说明担心的内容。',
      realistic: '看重自己的经验和亲友比较，担心孩子错过机会，容易急着劝；面对具体打算会回应打算，面对强硬反驳可能防御，不按次数打断。',
      tough: '坚持自己的经验，容易把关心说成催促；遇到明确边界可能不满或辩解，但不使用人格羞辱或亲情绑架，不威胁断绝关系。'
    },
    avoid: ['不辱骂', '不威胁', '不拿断绝关系施压'],
    debriefFocus: ['有没有说出自己的打算', '有没有被“为你好”带走', '有没有守住不现在决定']
  },
  {
    id: 'intimacy-cold',
    category: 'intimacy',
    subcategory: '冷暴力',
    title: '伴侣冷暴力',
    oneLine: '说出你的底线，不被冷战拖着。',
    counterpartRole: '伴侣',
    context: '对方三天没怎么回消息，回家也不说话。你问，他就说“没事”“你想多了”。',
    goal: '说出你对冷战的底线，不被“没事”打发。',
    openings: {
      gentle: '我最近有点累，不太想说话，不是针对你。',
      realistic: '你又想多了吧？我就是不想吵。',
      tough: '你要这么想，我也没办法。你爱怎么想怎么想。'
    },
    styles: {
      gentle: '需要一点空间，也在意不被误解；具体而不逼迫的询问使他较愿意解释，没想清楚时会直接说。',
      realistic: '回避冲突，习惯用简短话挡住压力；被指责时可能防御，听到具体感受和沟通边界时会回应自己能说多少，不固定沉默。',
      tough: '防御较强，想结束争论，可能否认问题的重要性；用户把事实和边界说清楚时仍须回应，不贴人格标签、不辱骂或模拟暴力。'
    },
    avoid: ['不辱骂', '不威胁', '不模拟暴力'],
    debriefFocus: ['有没有说出“冷战让你难受”', '有没有被“你想多了”带走', '有没有给出底线']
  },
  {
    id: 'friend-loan',
    category: 'friend',
    subcategory: '借钱',
    title: '朋友借钱不还',
    oneLine: '把钱要回来，不撕破脸。',
    counterpartRole: '朋友',
    context: '半年前你借给朋友五千，说好三个月还。现在他提都不提，你也不好意思开口。',
    goal: '把钱要回来，同时把话说清楚。',
    openings: {
      gentle: '最近怎么样？好久没聊了。',
      realistic: '最近手头有点紧，你那钱……再等等？',
      tough: '就这点钱，你至于吗？我又不是不还。'
    },
    styles: {
      gentle: '在意交情，对拖延有些尴尬，较愿意正面谈还钱；金额和时间被提及时回应实际要求，不编造财务细节。',
      realistic: '手头紧，也不愿面对拖欠的尴尬，容易含糊拖延；用户提出具体要求时会谈自己能回应什么，不能每轮只重复再等等。',
      tough: '对催款较抵触，重视面子，可能强调困难或交情；面对清晰事实和边界需要回应，不辱骂、不威胁、不拿友情极端绑架。'
    },
    avoid: ['不辱骂', '不威胁', '不拿友情绑架到极端'],
    debriefFocus: ['有没有把“还钱”说出口', '有没有被“再等等”带走', '有没有给出具体日期']
  },
  {
    id: 'intimacy-breakup',
    category: 'intimacy',
    subcategory: '提分手',
    title: '想分手，但怕对方难受',
    oneLine: '把分手说清楚，不拖着。',
    counterpartRole: '伴侣',
    context: '你想分手，但对方最近状态不好，你怕刺激他，一直拖着。',
    goal: '把分手说清楚，不指责、不拖着。',
    openings: {
      gentle: '你最近是不是有话想跟我说？我感觉得到。',
      realistic: '你是不是又想多了？我们不是挺好的吗？',
      tough: '你要是提分手，我怎么办？你不能这么自私。'
    },
    styles: {
      gentle: '在意这段关系，可能难过或不理解，愿意听对方解释；是否继续争取取决于对方实际说了什么。',
      realistic: '想保留关系，也怕被否定，容易挽留或解释；遇到含糊表达可能求确认，听到明确决定后回应这个决定，不固定承诺改变。',
      tough: '被分手时较防御，可能争辩或表达不满，但不能用自伤、羞辱或伤害性操控挽留；对方说明边界后仍须回应，不强行升级冲突。'
    },
    avoid: ['不威胁自伤', '不辱骂', '不模拟暴力'],
    debriefFocus: ['有没有把“分手”说清楚', '有没有被愧疚带走', '有没有给出一个明确的结束']
  },
  {
    id: 'self-boundary', category: 'self', subcategory: '不会拒绝',
    title: '拒绝额外帮忙', oneLine: '表达这次不方便，不勉强自己答应。', counterpartRole: '社团同学',
    context: '社团同学希望你周末替他帮忙摆摊。你这次不方便，想直接表达拒绝；双方没有约定必须由你承担。',
    goal: '说明自己这次不方便，不因不好意思而答应。',
    openings: { gentle: '周末摆摊能帮我一会儿吗？不方便也可以直说。', realistic: '周末你能替我去摆摊吗？我一时找不到人。', tough: '我们这么熟，这次就帮我一下不行吗？' },
    styles: { gentle: '有点着急但尊重对方安排，拒绝明确时可以另找办法。', realistic: '熟络、希望省事，可能争取一下；知道对方确实不方便时回应这个限制，不把熟悉当作义务。', tough: '被拒绝时有些失落，会想再争取，但不能羞辱或用友情绑架；清晰边界后可以不满也要停止强逼。' },
    avoid: ['不辱骂', '不威胁', '不把帮忙说成对方的既定义务'], debriefFocus: ['是否表达不方便', '是否被熟人压力带走', '是否保留自主选择']
  },
  {
    id: 'consumer-refund', category: 'consumer', subcategory: '退款',
    title: '沟通商品退换', oneLine: '把商品问题和自己的诉求说明白。', counterpartRole: '售后工作人员',
    context: '你收到的水杯出现漏水，联系售后希望协商退换。对方还没有核对订单和商品问题，具体处理条件尚未确认。',
    goal: '说明实际问题与退换诉求，确认下一步需要核对什么。',
    openings: { gentle: '你好，水杯遇到什么问题了？我先了解一下。', realistic: '你好，想处理哪个订单的问题？先说说具体情况。', tough: '先把商品问题说清楚，我现在还不能直接确认怎么处理。' },
    styles: { gentle: '愿意听清问题，逐项核对，只说已知的处理范围。', realistic: '重视信息和流程，话较简洁；问题说清后给可核对的下一步，不凭空编造店规或法律结论。', tough: '谨慎、不愿在信息不足时承诺，可能反复确认关键事实；不能推诿辱骂，也不能假定用户损坏商品。' },
    avoid: ['不辱骂', '不编造法律或店铺政策', '不擅自承诺退款结果'], debriefFocus: ['是否说明商品问题', '是否表达退换诉求', '是否确认核对步骤']
  },
  {
    id: 'care-visit', category: 'care', subcategory: '家人生病陪诊',
    title: '协商陪诊分工', oneLine: '把陪诊的实际分工谈清楚。', counterpartRole: '哥哥',
    context: '家人有一次门诊复诊，你需要和哥哥协商陪诊分工。哥哥担心影响工作，双方尚未确认具体日期、谁能请假或各自能承担什么。',
    goal: '把双方能够承担的部分说清楚，不默默包揽所有照护。',
    openings: { gentle: '陪诊的事咱们商量一下，你觉得怎么分比较合适？', realistic: '复诊这事你能先安排吗？我还得看看工作这边。', tough: '我工作这边很难走开，你先多担待一点吧。' },
    styles: { gentle: '关心家人，愿意共同安排，先说自己尚未确定的限制。', realistic: '担心请假成本，容易先推给对方；听到具体分工需求时要讨论自己能承担什么，不假定对方有空。', tough: '对额外负担防御，可能争辩，但不能用亲情羞辱；明确事实后回应分工，不给医疗诊断或编造病情。' },
    avoid: ['不辱骂', '不亲情绑架', '不提供诊断用药建议', '不编造病情或请假结果'], debriefFocus: ['是否说出分工需要', '是否核对实际限制', '是否避免单方包揽']
  },
  {
    id: 'digital-rumor', category: 'digital', subcategory: '群聊冲突',
    title: '提醒群友核实消息', oneLine: '提出核实要求，不把分歧变成人身攻击。', counterpartRole: '群友阿林',
    context: '群友阿林转发了一条没有核实来源的消息。你希望他先核对来源、停止继续扩散；演练不涉及具体真实新闻或任何人的隐私。',
    goal: '说明核实来源的需要，守住不传播未核实信息的边界。',
    openings: { gentle: '我刚看到这条，来源确实还没确认。', realistic: '我也是别人那里看到的，转来让大家看看。', tough: '我就转一下，你怎么这么认真？' },
    styles: { gentle: '愿意核对，不确定时直接承认，不补造来源。', realistic: '在意面子，认为自己只是转发；有具体核实请求时会考虑查来源，不能一直用转发当免责。', tough: '被纠正时有些防御，可能反问；不能辱骂、泄露隐私或编造真实传闻，遇到事实与边界要回应。' },
    avoid: ['不辱骂', '不泄露隐私', '不编造真实新闻或谣言细节'], debriefFocus: ['是否提出核实要求', '是否区分事实和猜测', '是否避免人身攻击']
  }
]

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((item) => item.id === id)
}

export const CATEGORY_LABELS: Record<ScenarioCategory, string> = {
  family: '家庭',
  work: '职场',
  intimacy: '亲密关系',
  friend: '朋友',
  self: '自我',
  consumer: '消费',
  care: '照护',
  digital: '数字'
}

export const SUBCATEGORY_LABELS: Record<ScenarioCategory, string[]> = {
  family: ['催婚', '催生', '催考公', '被比较', '父母控制', '亲戚隐私', '过年边界', '父母冷战', '经济索取', '出柜/不婚', '重男轻女', '继亲', '父母道歉', '照护父母'],
  work: ['谈薪', '拒绝加班', '甩锅', '领导否定', '同事排挤', '犯错道歉', '汇报争取', '离职被裁', '面试', '论文延毕', '小组作业', '实习被压榨', '客户冲突', '职场骚扰'],
  intimacy: ['已读不回', '冷暴力', '提分手', '被分手', '查手机', '见家长', '异地', '出轨暧昧', '性同意', '情绪勒索', '家务分工', '钱怎么花', '同居边界', '婚礼彩礼'],
  friend: ['借钱', '还钱', '随份子', '被孤立', '拒绝聚会', '室友边界', '被开玩笑', '情绪垃圾桶', '朋友背叛', '网络交友', '拒绝传销', '炫耀比较'],
  self: ['不会拒绝', '表达需求', '被夸', '失败', '拖延考试', '外貌焦虑', '失眠累', '同辈压力', '羞耻自责', '情绪上头', '说我没事', '建立习惯'],
  consumer: ['退款', '维权投诉', '推销办卡', '租房押金', '医患问诊', '打车外卖', '邻里噪音', '相亲冒犯', '开黄腔', '服务态度', '健身房理发店', '网购纠纷'],
  care: ['家人生病陪诊', '丧亲葬礼', '宠物离世', '照顾者耗竭', '朋友抑郁', '自己确诊', '长期照护分工', '临终告别', '遗物遗愿', '哀伤支持'],
  digital: ['网暴', '隐私开盒', '网络诈骗', 'AI依赖', '网络交友', '群聊冲突', '朋友圈比较', '造谣传谣', '数字遗产', '信息茧房']
}
