#!/usr/bin/env python3
"""Rebuild Lumewisp Luban Excel sources (copies SLG workbook shells for schema compat)."""
import os
import shutil
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
DATAS = ROOT / "SourceData" / "Datas"
SLG_DATAS = Path(
    os.environ.get(
        "SLG_LUBAN_DATAS",
        "/Users/sunix/SLG/SourceData/SourceData/Datas",
    )
)


def write_data(name, sheet, header_vars, header_types, header_groups, header_comments, rows):
    shutil.copy(SLG_DATAS / "item.xlsx", DATAS / name)
    wb = openpyxl.load_workbook(DATAS / name)
    ws = wb.active
    ws.title = sheet
    ws.delete_rows(1, ws.max_row)
    ws.append(["##var"] + header_vars)
    ws.append(["##"] + [None] * len(header_vars))
    ws.append(["##type"] + header_types)
    ws.append(["##group"] + header_groups)
    ws.append(["##"] + header_comments)
    for r in rows:
        ws.append([None] + list(r))
    wb.save(DATAS / name)


def main():
    DATAS.mkdir(parents=True, exist_ok=True)

    # Enums: keep SLG header cells, replace body.
    shutil.copy(SLG_DATAS / "__enums__.xlsx", DATAS / "__enums__.xlsx")
    wb = openpyxl.load_workbook(DATAS / "__enums__.xlsx")
    ws = wb.active
    ws.delete_rows(4, ws.max_row - 3)
    for row in [
        ["ConditionOperatorType", "ConditionOperatorType", False, True, None, "条件比较操作符", None, "Less", "小于", 0, "<", None],
        [None, None, None, None, None, None, None, "Greater", "大于", 1, ">", None],
        [None, None, None, None, None, None, None, "LessEqual", "小于等于", 2, "<=", None],
        [None, None, None, None, None, None, None, "GreaterEqual", "大于等于", 3, ">=", None],
        [None, None, None, None, None, None, None, "Equal", "等于", 4, "==", None],
        [None, None, None, None, None, None, None, "NotEqual", "不等于", 5, "!=", None],
        ["ConditionType", "ConditionType", False, True, None, "条件数据源", None, "ItemCount", "背包数量", 1, "param=itemId", None],
        [None, None, None, None, None, None, None, "GatherCount", "累计采集", 2, "param=itemId", None],
        [None, None, None, None, None, None, None, "TillCount", "累计锄地", 3, "", None],
        [None, None, None, None, None, None, None, "PlantCount", "累计播种", 4, "", None],
        [None, None, None, None, None, None, None, "WaterCount", "累计浇水", 5, "", None],
        [None, None, None, None, None, None, None, "HarvestCount", "累计收获", 6, "", None],
        [None, None, None, None, None, None, None, "CraftCount", "累计合成", 7, "param=recipeId", None],
        [None, None, None, None, None, None, None, "FishCount", "累计钓鱼", 8, "", None],
        [None, None, None, None, None, None, None, "Gold", "金币数量", 9, "", None],
        ["GotoAction", "GotoAction", False, True, None, "引导动作", None, "None", "无动作", 0, "", None],
        [None, None, None, None, None, None, None, "OpenCraft", "打开工作台", 1, "", None],
        [None, None, None, None, None, None, None, "SelectHoe", "选中锄头", 2, "", None],
        [None, None, None, None, None, None, None, "SelectSeeds", "选中种子", 3, "", None],
        [None, None, None, None, None, None, None, "SelectCan", "选中水壶", 4, "", None],
        [None, None, None, None, None, None, None, "SelectHand", "选中手", 5, "", None],
        [None, None, None, None, None, None, None, "SelectRod", "选中鱼竿", 6, "", None],
        [None, None, None, None, None, None, None, "OpenBag", "打开背包", 7, "", None],
        [None, None, None, None, None, None, None, "HintFarm", "提示农田", 8, "", None],
        [None, None, None, None, None, None, None, "HintGrass", "提示杂草", 9, "", None],
        [None, None, None, None, None, None, None, "HintFish", "提示钓鱼", 10, "", None],
        [None, None, None, None, None, None, None, "HintCraft", "提示工作台", 11, "", None],
    ]:
        ws.append(row)
    wb.save(DATAS / "__enums__.xlsx")

    shutil.copy(SLG_DATAS / "__beans__.xlsx", DATAS / "__beans__.xlsx")
    wb = openpyxl.load_workbook(DATAS / "__beans__.xlsx")
    ws = wb.active
    ws.delete_rows(4, ws.max_row - 3)
    wb.save(DATAS / "__beans__.xlsx")

    shutil.copy(SLG_DATAS / "__tables__.xlsx", DATAS / "__tables__.xlsx")
    wb = openpyxl.load_workbook(DATAS / "__tables__.xlsx")
    ws = wb.active
    ws.delete_rows(4, ws.max_row - 3)
    for row in [
        [None, "TCondition", "CCondition", True, "condition.xlsx", None, "map", "c", "条件模板", None, None],
        [None, "TCraftRecipe", "CCraftRecipe", True, "craft_recipe.xlsx", None, "map", "c", "合成配方", None, None],
        [None, "TCraftCost", "CCraftCost", True, "craft_cost.xlsx", None, "map", "c", "合成消耗", None, None],
        [None, "TQuest", "CQuest", True, "quest.xlsx", None, "map", "c", "主线任务", None, None],
        [None, "TGoto", "CGoto", True, "goto.xlsx", None, "map", "c", "引导跳转", None, None],
    ]:
        ws.append(row)
    wb.save(DATAS / "__tables__.xlsx")

    write_data(
        "condition.xlsx",
        "condition",
        ["id", "type", "compare_mode", "desc", "goto_id"],
        ["int", "ConditionType", "ConditionOperatorType", "string", "int"],
        ["c", "c", "c", "c", "c"],
        ["ID", "数据源", "比较", "描述", "跳转Goto表ID"],
        [
            [1, "GatherCount", "GreaterEqual", "采集{1} ×{0}", 9],
            [2, "TillCount", "GreaterEqual", "锄地 {0} 次", 2],
            [3, "CraftCount", "GreaterEqual", "合成「{1}」×{0}", 11],
            [4, "PlantCount", "GreaterEqual", "播种 {0} 次", 3],
            [5, "WaterCount", "GreaterEqual", "浇水 {0} 次", 4],
            [6, "HarvestCount", "GreaterEqual", "收获 {0} 次", 5],
            [7, "FishCount", "GreaterEqual", "钓到鱼 {0} 条", 6],
            [8, "ItemCount", "GreaterEqual", "背包拥有 {1} ×{0}", 7],
            [9, "Gold", "GreaterEqual", "金币达到 {0}", 0],
        ],
    )

    write_data(
        "goto.xlsx",
        "goto",
        ["id", "action", "hint"],
        ["int", "GotoAction", "string"],
        ["c", "c", "c"],
        ["ID", "动作", "提示文案"],
        [
            [0, "None", ""],
            [2, "SelectHoe", "请选中锄头，点击荒地开垦"],
            [3, "SelectSeeds", "请选中种子，点击翻好地块播种"],
            [4, "SelectCan", "请选中水壶，给作物浇水"],
            [5, "SelectHand", "作物成熟后，空手点击收获"],
            [6, "SelectRod", "先选鱼竿，跟着箭头走到西边码头抛竿"],
            [7, "OpenBag", "打开背包查看物品"],
            [8, "HintFarm", "前往农田地块操作"],
            [9, "HintGrass", "用手拔除院子里的杂草"],
            [10, "HintFish", "跟着箭头走到湖边码头，点击抛竿"],
            [11, "HintCraft", "走到工作台旁点击打开合成"],
        ],
    )

    write_data(
        "craft_recipe.xlsx",
        "craft_recipe",
        ["id", "name", "desc", "out_item", "out_count", "craft_seconds", "sort"],
        ["string", "string", "string", "string", "int", "int", "int"],
        ["c", "c", "c", "c", "c", "c", "c"],
        ["配方ID", "名称", "描述", "产出物品", "产出数量", "耗时秒", "排序"],
        [
            ["seed_from_grass", "种子", "把草料搓成可播种的种子", "seeds", 1, 12, 10],
            ["seed_mix", "混合种子", "泥土与草料拌成的种子袋", "seeds", 2, 18, 20],
            ["wood_bundle", "精制木料", "用草绳捆扎，多出一根可用木料", "wood", 3, 20, 30],
            ["stone_pack", "加固石料", "泥土粘合碎石，得到更多石料", "stone", 2, 22, 40],
            ["fish_bait_seed", "鱼肥种子", "鱼骨与草料沤成的肥沃种子", "seeds", 3, 28, 50],
        ],
    )

    write_data(
        "craft_cost.xlsx",
        "craft_cost",
        ["id", "recipe_id", "item_id", "count"],
        ["int", "string", "string", "int"],
        ["c", "c", "c", "c"],
        ["ID", "配方ID", "消耗物品", "数量"],
        [
            [1, "seed_from_grass", "grass", 3],
            [2, "seed_mix", "dirt", 2],
            [3, "seed_mix", "grass", 2],
            [4, "wood_bundle", "wood", 2],
            [5, "wood_bundle", "grass", 1],
            [6, "stone_pack", "stone", 1],
            [7, "stone_pack", "dirt", 2],
            [8, "fish_bait_seed", "fish", 1],
            [9, "fish_bait_seed", "grass", 2],
        ],
    )

    write_data(
        "quest.xlsx",
        "quest",
        [
            "id",
            "name",
            "desc",
            "condition_id",
            "param",
            "num",
            "goto_id",
            "reward_gold",
            "reward_item",
            "reward_count",
            "next_id",
            "sort",
        ],
        ["int", "string", "string", "int", "string", "int", "int", "int", "string", "int", "int", "int"],
        ["c"] * 12,
        ["ID", "标题", "说明", "条件模板", "条件参数", "目标值", "跳转", "金币奖励", "物品奖励", "物品数量", "下一任务", "排序"],
        [
            [1001, "清理院子", "用手拔除院子里的杂草，收集草料。", 1, "grass", 3, 9, 20, "", 0, 1002, 10],
            [1002, "开垦田地", "选中锄头，把一块荒地开垦成可播种的田。", 2, "", 1, 2, 20, "", 0, 1003, 20],
            [1003, "搓出种子", "走到工作台，用草料合成种子。", 3, "seed_from_grass", 1, 11, 30, "seeds", 1, 1004, 30],
            [1004, "播种希望", "选中种子，在翻好的田地上播种。", 4, "", 1, 3, 20, "", 0, 1005, 40],
            [1005, "浇灌作物", "选中水壶，给刚种下的作物浇水。", 5, "", 1, 4, 20, "", 0, 1006, 50],
            [1006, "丰收时刻", "作物成熟后，空手点击地块收获。", 6, "", 1, 5, 40, "parsnip", 1, 1007, 60],
            [1007, "湖边垂钓", "先选鱼竿，跟着箭头走到西边码头，点击抛竿钓一条鱼。", 7, "", 1, 6, 50, "fish", 1, 0, 70],
        ],
    )

    conf = ROOT / "SourceData" / "luban.conf"
    conf.write_text(
        '{\n'
        '\t"groups":\n'
        '\t[\n'
        '\t\t{"names":["c"], "default":true},\n'
        '\t\t{"names":["s"], "default":true},\n'
        '\t\t{"names":["e"], "default":true}\n'
        '\t],\n'
        '\t"schemaFiles":\n'
        '\t[\n'
        '\t\t{"fileName":"Datas/__tables__.xlsx", "type":"table"},\n'
        '\t\t{"fileName":"Datas/__beans__.xlsx", "type":"bean"},\n'
        '\t\t{"fileName":"Datas/__enums__.xlsx", "type":"enum"}\n'
        '\t],\n'
        '\t"dataDir": "Datas",\n'
        '\t"targets":\n'
        '\t[\n'
        '\t\t{"name":"client", "manager":"Tables", "groups":["c"], "topModule":"cfg"}\n'
        '\t]\n'
        '}\n',
        encoding="utf-8",
    )
    print("Wrote Luban source under", DATAS)


if __name__ == "__main__":
    main()
