"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.default = RootLayout;
const sonner_1 = require("sonner");
require("./globals.css");
const Sidebar_1 = __importDefault(require("@/components/Sidebar"));
exports.metadata = {
    title: 'COZMO Admin',
    description: 'COZE Hospitality Admin Dashboard',
};
function RootLayout({ children }) {
    return (<html lang="en">
      <body className="flex h-screen overflow-hidden bg-background text-foreground">
        <Sidebar_1.default />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-8">
            {children}
          </div>
        </main>
        <sonner_1.Toaster position="bottom-right" richColors closeButton/>
      </body>
    </html>);
}
