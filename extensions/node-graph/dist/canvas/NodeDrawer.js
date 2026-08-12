"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FIELD_ROW_H = exports.BODY_PAD_TOP = exports.PORT_PAD_X = exports.PORT_ROW_H = exports.HEADER_H = exports.PORT_RADIUS = void 0;
exports.measureNode = measureNode;
exports.getPortLocalPos = getPortLocalPos;
exports.getPortScreenPos = getPortScreenPos;
exports.drawNode = drawNode;
exports.hitTestNode = hitTestNode;
exports.hitTestPort = hitTestPort;
const nodeFields_1 = require("../core/nodeFields");
const NodeRegistry_1 = require("../core/NodeRegistry");
const PortTypeRegistry_1 = require("../core/PortTypeRegistry");
exports.PORT_RADIUS = 6;
exports.HEADER_H = 28;
exports.PORT_ROW_H = 22;
exports.PORT_PAD_X = 12;
exports.BODY_PAD_TOP = 8;
/** 字段控件行高（标签 + 输入框/下拉/单选） */
exports.FIELD_ROW_H = 36;
const FIELD_WARN_ROW_H = 18;
function measureNode(node) {
    const rows = Math.max(node.inputs.length, node.outputs.length, 1);
    const fields = (0, nodeFields_1.fieldsForNode)(node);
    const def = NodeRegistry_1.NodeRegistry.get(node.typeName);
    let fieldBlock = 0;
    if (fields.length > 0) {
        fieldBlock = 8 + fields.length * exports.FIELD_ROW_H;
        if (!def)
            fieldBlock += FIELD_WARN_ROW_H;
    }
    const h = Math.max(node.minHeight, exports.HEADER_H + exports.BODY_PAD_TOP + rows * exports.PORT_ROW_H + fieldBlock + 10);
    // 有字段时略加宽，便于显示输入框
    const minW = fields.length > 0 ? Math.max(node.minWidth, 200) : node.minWidth;
    const w = Math.max(minW, node.position.w);
    node.position.w = w;
    node.position.h = h;
    return { w, h };
}
function getPortLocalPos(node, portIndex, isInput) {
    measureNode(node);
    const y = exports.HEADER_H + exports.BODY_PAD_TOP + portIndex * exports.PORT_ROW_H + exports.PORT_ROW_H * 0.5;
    const x = isInput ? 0 : node.position.w;
    return { x, y };
}
function getPortScreenPos(node, portIndex, isInput, canvas) {
    const local = getPortLocalPos(node, portIndex, isInput);
    return canvas.canvasToScreen(node.position.x + local.x, node.position.y + local.y);
}
function drawNode(ctx, node, canvas, selected, light = false) {
    var _a, _b, _c;
    const { w, h } = measureNode(node);
    const tl = canvas.canvasToScreen(node.position.x, node.position.y);
    const zw = w * canvas.zoom;
    const zh = h * canvas.zoom;
    const r = 6 * canvas.zoom;
    const z = canvas.zoom;
    const def = NodeRegistry_1.NodeRegistry.get(node.typeName);
    const headerColor = (_a = def === null || def === void 0 ? void 0 : def.color) !== null && _a !== void 0 ? _a : '#555555';
    const body = light ? '#f4f4f4' : '#2d2d2d';
    const border = selected ? '#ffcc33' : light ? '#999' : '#111';
    const titleColor = '#ffffff';
    const portLabel = light ? '#333' : '#ddd';
    roundRect(ctx, tl.x, tl.y, zw, zh, r);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = (selected ? 2.5 : 1) * z;
    ctx.strokeStyle = border;
    ctx.stroke();
    ctx.save();
    roundRect(ctx, tl.x, tl.y, zw, exports.HEADER_H * z, r);
    ctx.clip();
    ctx.fillStyle = headerColor;
    ctx.fillRect(tl.x, tl.y, zw, exports.HEADER_H * z + r);
    ctx.restore();
    // header bottom cover
    ctx.fillStyle = headerColor;
    ctx.fillRect(tl.x, tl.y + (exports.HEADER_H - 4) * z, zw, 4 * z);
    ctx.fillStyle = titleColor;
    ctx.font = `600 ${12 * z}px sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(node.title, tl.x + 10 * z, tl.y + (exports.HEADER_H * 0.5) * z, zw - 20 * z);
    ctx.font = `${11 * z}px sans-serif`;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < node.inputs.length; i++) {
        const p = getPortScreenPos(node, i, true, canvas);
        drawPort(ctx, p.x, p.y, node.inputs[i].portType, z);
        ctx.fillStyle = portLabel;
        ctx.textAlign = 'left';
        ctx.fillText(node.inputs[i].name, p.x + 10 * z, p.y);
    }
    for (let i = 0; i < node.outputs.length; i++) {
        const p = getPortScreenPos(node, i, false, canvas);
        drawPort(ctx, p.x, p.y, node.outputs[i].portType, z);
        ctx.fillStyle = portLabel;
        ctx.textAlign = 'right';
        ctx.fillText(node.outputs[i].name, p.x - 10 * z, p.y);
    }
    // 字段画成输入框 / 下拉 / 单选外观（实际编辑仍在右侧检视器或双击）
    const fields = (0, nodeFields_1.fieldsForNode)(node);
    if (fields.length > 0) {
        const portRows = Math.max(node.inputs.length, node.outputs.length, 1);
        let fy = tl.y + (exports.HEADER_H + exports.BODY_PAD_TOP + portRows * exports.PORT_ROW_H + 6) * z;
        const boxX = tl.x + 10 * z;
        const boxW = zw - 20 * z;
        if (!def) {
            ctx.textAlign = 'left';
            ctx.font = `${11 * z}px sans-serif`;
            ctx.fillStyle = light ? '#a60' : '#fc6';
            ctx.fillText('⚠ 节点未注册，请重载扩展', boxX, fy + FIELD_WARN_ROW_H * 0.5 * z, boxW);
            fy += FIELD_WARN_ROW_H * z;
        }
        for (const f of fields) {
            const raw = (_c = (_b = node.customData[f.key]) !== null && _b !== void 0 ? _b : f.default) !== null && _c !== void 0 ? _c : '';
            drawFieldControl(ctx, f, raw, boxX, fy, boxW, z, light);
            fy += exports.FIELD_ROW_H * z;
        }
    }
    ctx.textAlign = 'left';
}
function drawFieldControl(ctx, field, raw, x, y, boxW, zoom, light) {
    const labelColor = light ? '#555' : '#9ad';
    const textColor = light ? '#222' : '#eee';
    const boxBg = light ? '#fff' : '#1a1a1a';
    const boxBorder = light ? '#999' : '#666';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = labelColor;
    ctx.font = `${10 * zoom}px sans-serif`;
    const label = field.label.length > 18 ? `${field.label.slice(0, 16)}…` : field.label;
    ctx.fillText(label, x, y);
    const boxY = y + 12 * zoom;
    const boxH = 20 * zoom;
    if (field.type === 'bool') {
        const on = raw === true || raw === 'true' || raw === 1 || raw === '1';
        drawRadio(ctx, x, boxY + 2 * zoom, '是', on, zoom, textColor);
        drawRadio(ctx, x + 48 * zoom, boxY + 2 * zoom, '否', !on, zoom, textColor);
        return;
    }
    roundRect(ctx, x, boxY, boxW, boxH, 4 * zoom);
    ctx.fillStyle = boxBg;
    ctx.fill();
    ctx.strokeStyle = boxBorder;
    ctx.lineWidth = 1 * zoom;
    ctx.stroke();
    const display = formatFieldValue(raw, field);
    ctx.fillStyle = textColor;
    ctx.font = `${11 * zoom}px sans-serif`;
    ctx.textBaseline = 'middle';
    const padR = field.type === 'enum' ? 22 * zoom : 12 * zoom;
    ctx.fillText(display, x + 8 * zoom, boxY + boxH / 2, boxW - padR);
    if (field.type === 'enum') {
        const cx = x + boxW - 10 * zoom;
        const cy = boxY + boxH / 2;
        ctx.beginPath();
        ctx.moveTo(cx - 4 * zoom, cy - 2 * zoom);
        ctx.lineTo(cx, cy + 3 * zoom);
        ctx.lineTo(cx + 4 * zoom, cy - 2 * zoom);
        ctx.strokeStyle = light ? '#666' : '#9aa3b2';
        ctx.lineWidth = 1.2 * zoom;
        ctx.stroke();
    }
}
function drawRadio(ctx, x, y, label, on, zoom, textColor) {
    const r = 5 * zoom;
    ctx.beginPath();
    ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1 * zoom;
    ctx.stroke();
    if (on) {
        ctx.beginPath();
        ctx.arc(x + r, y + r, r * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#5b9fd4';
        ctx.fill();
    }
    ctx.fillStyle = textColor;
    ctx.font = `${11 * zoom}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + r * 2 + 5 * zoom, y + r);
}
function formatFieldValue(v, field) {
    var _a;
    if ((field === null || field === void 0 ? void 0 : field.type) === 'enum' && ((_a = field.options) === null || _a === void 0 ? void 0 : _a.length)) {
        const hit = field.options.find((o) => String(o.value) === String(v));
        if (hit) {
            const label = hit.label;
            return label.length > 18 ? `${label.slice(0, 16)}…` : label;
        }
    }
    if (typeof v === 'string')
        return v.length > 18 ? `${v.slice(0, 16)}…` : v;
    if (typeof v === 'number' || typeof v === 'boolean')
        return String(v);
    if (v == null)
        return '';
    try {
        const s = JSON.stringify(v);
        return s.length > 18 ? `${s.slice(0, 16)}…` : s;
    }
    catch {
        return String(v);
    }
}
function drawPort(ctx, x, y, portType, zoom) {
    const r = exports.PORT_RADIUS * zoom;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (portType === PortTypeRegistry_1.PortTypeRegistry.GraphFlow) {
        ctx.fillStyle = '#1a1a1a';
        ctx.fill();
        ctx.strokeStyle = '#eeeeee';
        ctx.lineWidth = 1.5 * zoom;
        ctx.stroke();
    }
    else {
        ctx.fillStyle = PortTypeRegistry_1.PortTypeRegistry.getColor(portType);
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1 * zoom;
        ctx.stroke();
    }
}
function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}
function hitTestNode(node, canvasX, canvasY) {
    measureNode(node);
    const { x, y, w, h } = node.position;
    return canvasX >= x && canvasX <= x + w && canvasY >= y && canvasY <= y + h;
}
function hitTestPort(node, canvas, sx, sy) {
    const thresh = exports.PORT_RADIUS * 2.2 * canvas.zoom;
    for (let i = 0; i < node.inputs.length; i++) {
        const p = getPortScreenPos(node, i, true, canvas);
        if (Math.hypot(sx - p.x, sy - p.y) <= thresh)
            return { isInput: true, index: i };
    }
    for (let i = 0; i < node.outputs.length; i++) {
        const p = getPortScreenPos(node, i, false, canvas);
        if (Math.hypot(sx - p.x, sy - p.y) <= thresh)
            return { isInput: false, index: i };
    }
    return null;
}
//# sourceMappingURL=NodeDrawer.js.map