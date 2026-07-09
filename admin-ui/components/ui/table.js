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
exports.TableCell = exports.TableHead = exports.TableRow = exports.TableBody = exports.TableHeader = exports.Table = void 0;
const React = __importStar(require("react"));
const utils_1 = require("@/lib/utils");
const Table = React.forwardRef(({ className, ...props }, ref) => (<div className="w-full overflow-hidden rounded-lg border border-border">
      <table ref={ref} className={(0, utils_1.cn)('w-full caption-bottom text-sm', className)} {...props}/>
    </div>));
exports.Table = Table;
Table.displayName = 'Table';
const TableHeader = React.forwardRef(({ className, ...props }, ref) => (<thead ref={ref} className={(0, utils_1.cn)('bg-secondary', className)} {...props}/>));
exports.TableHeader = TableHeader;
TableHeader.displayName = 'TableHeader';
const TableBody = React.forwardRef(({ className, ...props }, ref) => (<tbody ref={ref} className={(0, utils_1.cn)('divide-y divide-border', className)} {...props}/>));
exports.TableBody = TableBody;
TableBody.displayName = 'TableBody';
const TableRow = React.forwardRef(({ className, ...props }, ref) => (<tr ref={ref} className={(0, utils_1.cn)('transition-colors hover:bg-secondary/50', className)} {...props}/>));
exports.TableRow = TableRow;
TableRow.displayName = 'TableRow';
const TableHead = React.forwardRef(({ className, ...props }, ref) => (<th ref={ref} className={(0, utils_1.cn)('px-3 py-2 text-left text-xs font-medium text-muted-foreground', className)} {...props}/>));
exports.TableHead = TableHead;
TableHead.displayName = 'TableHead';
const TableCell = React.forwardRef(({ className, ...props }, ref) => (<td ref={ref} className={(0, utils_1.cn)('px-3 py-2.5 text-sm', className)} {...props}/>));
exports.TableCell = TableCell;
TableCell.displayName = 'TableCell';
