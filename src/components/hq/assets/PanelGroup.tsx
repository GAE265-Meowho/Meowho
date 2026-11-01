// 3D 編輯器右側參數面板的一個群組（#96）：用原生 <details> 摺疊，收合時內容仍保留在畫面樹上，參數值不會重設。
import type { ReactNode } from "react";

export function PanelGroup({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="hq-group" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="hq-group-body">{children}</div>
    </details>
  );
}
