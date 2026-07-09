"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cn = cn;
exports.fmt = fmt;
const clsx_1 = require("clsx");
const tailwind_merge_1 = require("tailwind-merge");
function cn(...inputs) {
    return (0, tailwind_merge_1.twMerge)((0, clsx_1.clsx)(inputs));
}
function fmt(n) {
    return n.toLocaleString('en-US');
}
