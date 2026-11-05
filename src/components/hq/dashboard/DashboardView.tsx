"use client";
// #226：縮短區塊說明、拿掉區內重複時間；空狀態卡降權
import Link from "next/link";
import type { DashboardPayload } from "@/lib/hq/dashboard/types";
import { formatBytes, formatPercent, formatUpdatedAt } from "@/lib/hq/dashboard/format";
import { KpiCard } from "./KpiCard";

const KIND_LABEL = { video: "影片", image: "圖片", other: "其他檔案" } as const;

export function DashboardView({ data }: { data: DashboardPayload }) {
  const { business: b, supabase: s, vercel: v } = data;
  return (
    <div className="hq-dash">
      {data.preview && (
        <p className="hq-banner" role="status">示範模式：未設定 service role，數值為 0／尚未啟用，非正式資料。</p>
      )}

      <section className="hq-section hq-dash-sec" aria-label="業務 KPI">
        <h2 className="hq-dash-h">業務 KPI</h2>
        <div className="hq-cards hq-kpi-grid">
          <KpiCard title="目前貓戶（住戶）" kpi={b.households} />
          <KpiCard title="付費貓咪" kpi={b.paidCats} />
          <KpiCard title="貓咪總數" kpi={b.catsTotal} />
          <KpiCard title="管理員" kpi={b.admins} />
        </div>
        <div className="hq-cards hq-kpi-grid" style={{ marginTop: "0.85rem" }}>
          <KpiCard title="待審核資料" kpi={b.pendingReview}>
            <ul className="hq-kpi-break">
              <li><Link href="/MeowHQ/users?tab=shelters&status=pending">中途認證 <b>{b.pendingByType.shelterVerifications}</b></Link></li>
              <li><Link href="/MeowHQ/assets">紋理貼圖待確認 <b>{b.pendingByType.textures}</b></Link></li>
              <li><span>貓咪模型草稿 <b>{b.pendingByType.catModelsDraft}</b></span></li>
              <li><Link href="/MeowHQ/assets?tab=rooms">房間任務排隊 <b>{b.pendingByType.roomJobsQueued}</b></Link></li>
            </ul>
          </KpiCard>
          <KpiCard title="3D 元件／模型" kpi={b.models3d} />
          <KpiCard title="生成中任務" kpi={b.jobs.generating} />
          <KpiCard title="成功／失敗任務" kpi={b.jobs.success}>
            <p className="hq-hint hq-kpi-note">成功 {b.jobs.success.value ?? 0}　失敗 {b.jobs.failed.value ?? 0}</p>
          </KpiCard>
        </div>
      </section>

      <section className="hq-section hq-dash-sec" aria-label="Supabase 資源">
        <h2 className="hq-dash-h">Supabase 資源</h2>
        <p className="hq-hint hq-dash-lead">
          列數與 Storage 容量分開顯示；Storage 上限 {formatBytes(s.storageLimitBytes)}。
        </p>
        <div className="hq-cards hq-kpi-grid">
          <KpiCard title="資料表數（meow_）" kpi={s.tableCount} />
          <KpiCard title="資料列總筆數" kpi={s.rowTotal} />
          <KpiCard title="資料庫容量" kpi={s.dbBytes} format="bytes" />
          <KpiCard title="Storage 總用量" kpi={s.storageBytes} format="bytes" />
          <KpiCard title="Storage 剩餘" kpi={s.storageRemainingBytes} format="bytes" />
          <KpiCard title="Storage 使用率" kpi={s.storageUsageRatio} format="percent" />
        </div>
        <div className="hq-dash-bars" aria-label="儲存空間分布">
          {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map(k => (
            <div key={k} className="hq-dash-bar">
              <div className="hq-dash-bar-label">
                <span>{KIND_LABEL[k]}</span>
                <span>{formatBytes(s.byKind[k].bytes)}（{formatPercent(s.byKind[k].ratio)}）</span>
              </div>
              <div className="hq-progress-bar" aria-hidden="true">
                <span className="on" style={{ width: `${Math.min(100, Math.round(s.byKind[k].ratio * 100))}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="hq-section hq-dash-sec" aria-label="Vercel／系統健康">
        <h2 className="hq-dash-h">Vercel API／系統健康</h2>
        <p className="hq-hint hq-dash-lead">
          視窗 {v.windowHours} 小時。
          {v.healthOk == null ? "健康檢查：尚無" : v.healthOk ? "Supabase 健康檢查：正常" : "Supabase 健康檢查：異常"}
          {v.lastHealthCheckAt ? `（${formatUpdatedAt(v.lastHealthCheckAt)}）` : ""}
          {!v.available && v.reason ? `　｜　${v.reason}` : ""}
        </p>
        <div className="hq-cards hq-kpi-grid">
          <KpiCard title="API 請求數" kpi={v.requests} />
          <KpiCard title="成功率" kpi={v.successRate} format="percent" />
          <KpiCard title="4xx 錯誤率" kpi={v.errorRate4xx} format="percent" />
          <KpiCard title="5xx 錯誤率" kpi={v.errorRate5xx} format="percent" />
          <KpiCard title="Timeout" kpi={v.timeouts} />
          <KpiCard title="平均回應時間" kpi={v.functionDurationMs} format="ms" />
          <KpiCard title="外部 API 錯誤" kpi={v.externalErrors} />
        </div>
        {v.routes.length > 0 && (
          <div className="hq-table-wrap" style={{ marginTop: "1rem" }}>
            <table className="hq-table">
              <thead>
                <tr>
                  <th>Route</th>
                  <th>分組</th>
                  <th>請求</th>
                  <th>4xx</th>
                  <th>5xx</th>
                  <th>平均</th>
                  <th>P75</th>
                </tr>
              </thead>
              <tbody>
                {v.routes.slice(0, 12).map(r => (
                  <tr key={r.route}>
                    <td><code>{r.route}</code></td>
                    <td>{r.group}</td>
                    <td>{r.requests}</td>
                    <td>{r.errors4xx}</td>
                    <td>{r.errors5xx}</td>
                    <td>{r.avgMs == null ? "—" : `${Math.round(r.avgMs)} ms`}</td>
                    <td>{r.p75Ms == null ? "—" : `${Math.round(r.p75Ms)} ms`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(v.slowestRoute || v.highestErrorRoute) && (
              <p className="hq-hint">
                {v.slowestRoute ? `最慢：${v.slowestRoute}` : ""}
                {v.slowestRoute && v.highestErrorRoute ? "　｜　" : ""}
                {v.highestErrorRoute ? `錯誤率最高：${v.highestErrorRoute}` : ""}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
