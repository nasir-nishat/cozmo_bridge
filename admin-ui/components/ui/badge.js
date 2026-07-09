"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.badgeVariants = void 0;
exports.Badge = Badge;
const React = __importStar(require("react"));
const class_variance_authority_1 = require("class-variance-authority");
const utils_1 = require("@/lib/utils");
const badgeVariants = (0, class_variance_authority_1.cva)('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors', {
    variants: {
        variant: {
            default: 'border-transparent bg-primary text-primary-foreground',
            secondary: 'border-border bg-secondary text-secondary-foreground',
            success: 'border-[#a5d6a7] bg-[#e8f5e9] text-[#1b5e20]',
            info: 'border-[#90caf9] bg-[#e3f2fd] text-[#0d47a1]',
            warning: 'border-[#ffcc80] bg-[#fff3e0] text-[#e65100]',
            destructive: 'border-transparent bg-destructive text-destructive-foreground',
            outline: 'border-border text-muted-foreground bg-transparent',
        },
    },
    defaultVariants: {
        variant: 'default',
    },
});
exports.badgeVariants = badgeVariants;
function Badge({ className, variant, ...props }) {
    return <div className={(0, utils_1.cn)(badgeVariants({ variant }), className)} {...props}/>;
}
