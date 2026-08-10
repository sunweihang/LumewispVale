/** Town institutions, shops, and board quests — data only. */

export type TownShopId = 'seed' | 'ore' | 'general' | 'fish' | 'saloon';

export type TownGoodsId =
    | 'seed_parsnip'
    | 'seed_potato'
    | 'seed_cauli'
    | 'seed_berry'
    | 'seed_pumpkin'
    | 'ore_stone'
    | 'ore_copper'
    | 'ore_iron'
    | 'ore_gold'
    | 'bait'
    | 'fiber_pack'
    | 'wood_pack'
    | 'snack';

export type TownBuildingKind =
    | 'seedshop'
    | 'oreshop'
    | 'general'
    | 'police'
    | 'post'
    | 'clinic'
    | 'school'
    | 'mayor'
    | 'community'
    | 'saloon'
    | 'fishshop'
    | 'library'
    | 'museum'
    | 'carpenter'
    | 'home';

export interface TownGoods {
    id: TownGoodsId;
    title: string;
    desc: string;
    price: number;
    /** How many units granted per purchase. */
    count: number;
}

export interface TownShopDef {
    id: TownShopId;
    title: string;
    building: TownBuildingKind;
    goods: TownGoods[];
}

export interface TownBoardQuest {
    id: string;
    title: string;
    desc: string;
    rewardGold: number;
    source: 'police' | 'post';
}

export const TOWN_SHOPS: TownShopDef[] = [
    {
        id: 'seed',
        title: '微光种子店',
        building: 'seedshop',
        goods: [
            {
                id: 'seed_parsnip',
                title: '防风草种子',
                desc: '春天稳产作物，适合新手',
                price: 20,
                count: 5,
            },
            {
                id: 'seed_potato',
                title: '土豆种子',
                desc: '耐旱，产量不错',
                price: 30,
                count: 4,
            },
            {
                id: 'seed_cauli',
                title: '花椰菜种子',
                desc: '生长期较长，卖价更高',
                price: 50,
                count: 3,
            },
            {
                id: 'seed_berry',
                title: '草莓种子',
                desc: '可多次收获的甜蜜作物',
                price: 80,
                count: 2,
            },
            {
                id: 'seed_pumpkin',
                title: '南瓜种子',
                desc: '秋季巨物，一颗顶一筐',
                price: 100,
                count: 2,
            },
        ],
    },
    {
        id: 'ore',
        title: '矿脉商会',
        building: 'oreshop',
        goods: [
            { id: 'ore_stone', title: '石料', desc: '基础建材与工艺原料', price: 15, count: 10 },
            { id: 'ore_copper', title: '铜矿石', desc: '打造工具的入门矿', price: 40, count: 5 },
            { id: 'ore_iron', title: '铁矿石', desc: '更坚硬的锻造材料', price: 70, count: 4 },
            { id: 'ore_gold', title: '金矿石', desc: '稀有闪光矿脉', price: 120, count: 2 },
        ],
    },
    {
        id: 'general',
        title: '杂货铺',
        building: 'general',
        goods: [
            { id: 'fiber_pack', title: '纤维捆', desc: '编织与制作常用', price: 25, count: 8 },
            { id: 'wood_pack', title: '木材捆', desc: '建筑与燃料', price: 35, count: 10 },
            { id: 'bait', title: '鱼饵', desc: '提高咬钩概率（占位）', price: 15, count: 5 },
            { id: 'snack', title: '旅途干粮', desc: '补充体力的小点心（占位）', price: 10, count: 1 },
        ],
    },
    {
        id: 'fish',
        title: '渔具店',
        building: 'fishshop',
        goods: [
            { id: 'bait', title: '高级鱼饵', desc: '湖边好帮手', price: 25, count: 8 },
            { id: 'snack', title: '烤鱼片', desc: '渔夫招牌小吃', price: 18, count: 1 },
        ],
    },
    {
        id: 'saloon',
        title: '溪谷酒馆',
        building: 'saloon',
        goods: [
            { id: 'snack', title: '热汤', desc: '驱散旅途疲惫', price: 12, count: 1 },
            { id: 'snack', title: '麦芽酒', desc: '本地特色（占位）', price: 20, count: 1 },
        ],
    },
];

/** Random board quests — police = town incidents, post = delivery jobs. */
export const POLICE_QUEST_POOL: TownBoardQuest[] = [
    {
        id: 'pol_chicken',
        title: '走失的鸡',
        desc: '有人在广场附近看见一群乱跑的鸡，帮忙把它们哄回去。',
        rewardGold: 40,
        source: 'police',
    },
    {
        id: 'pol_noise',
        title: '深夜噪音',
        desc: '酒馆打烊后仍有喧哗，去打听一下发生了什么。',
        rewardGold: 35,
        source: 'police',
    },
    {
        id: 'pol_ore',
        title: '失窃矿车',
        desc: '矿脉商会少了一车铜矿，沿南路搜查线索。',
        rewardGold: 60,
        source: 'police',
    },
    {
        id: 'pol_cat',
        title: '镇长的猫',
        desc: '镇长家的花猫又爬上了社区中心屋顶。',
        rewardGold: 45,
        source: 'police',
    },
];

export const POST_QUEST_POOL: TownBoardQuest[] = [
    {
        id: 'post_mayor',
        title: '急件：镇长',
        desc: '把这封盖章信件送到镇长家门口。',
        rewardGold: 30,
        source: 'post',
    },
    {
        id: 'post_clinic',
        title: '药品签收',
        desc: '诊所订了一批草药，帮邮局跑一趟。',
        rewardGold: 35,
        source: 'post',
    },
    {
        id: 'post_school',
        title: '课本包裹',
        desc: '学校开学在即，把包裹交给校门口。',
        rewardGold: 28,
        source: 'post',
    },
    {
        id: 'post_farm',
        title: '农场通告',
        desc: '把丰收节海报带到南边通往农场的路牌旁。',
        rewardGold: 40,
        source: 'post',
    },
];

export function shopByBuilding(kind: string): TownShopDef | null {
    return TOWN_SHOPS.find((s) => s.building === kind) ?? null;
}
