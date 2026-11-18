type Props = {
  photo: string;
  isDemo: boolean;
  uploading: boolean;
  consent: boolean;
  busy: boolean;
  onLoadFile: (f: File | undefined) => Promise<void>;
  onDemo: () => void;
  onConsent: (v: boolean) => void;
  onAnalyze: () => Promise<void>;
  onNext: () => void;
  onRemove: () => void;
};
export default function PhotoStep({
  photo,
  isDemo,
  uploading,
  consent,
  busy,
  onLoadFile,
  onDemo,
  onConsent,
  onAnalyze,
  onNext,
  onRemove,
}: Props) {
  return (
    <section className="panel upload-panel">
      <div className="section-heading">
        <div>
          <h2>從一張房間照片開始</h2>
        </div>
        <span className="small">本次資料不自動儲存</span>
      </div>
      <div className="upload-layout"><div className="upload-main">
      {!photo && (
        <div className="upload-empty">
          <span className="photo-icon" aria-hidden="true">▧</span>
          <h3>把家的日常，帶進實驗室</h3>
          <p>拍下窗戶、家具與活動空間。<br/>JPEG、PNG、WebP · 15 MB 以下</p>
        </div>
      )}
      {photo && <div className="photo-frame upload-preview"><img src={photo} alt={isDemo ? '虛構房間示意，非真實照片' : '本次上傳的居家照片'}/></div>}
      <div className="upload-actions">
        <label className="primary file-button">
          手機拍照
          <input
            aria-label="手機拍照"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={uploading}
            onChange={(e) => {
              void onLoadFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <label className="secondary file-button">
          {photo ? '更換照片' : '上傳照片'}
          <input
            aria-label={photo ? '更換照片' : '上傳照片'}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={(e) => {
              void onLoadFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {photo && <button className="text-button danger" disabled={busy || uploading} onClick={onRemove}>移除照片</button>}
      {!photo && (
        <button className="text-button" onClick={onDemo}>
          先用虛構示範試試看 →
        </button>
      )}
      {uploading && <p role="status">正在處理照片…</p>}
      </div><aside className="upload-guide"><h3>一張照片，一份改善方向</h3><p>以單貓居家 14 項照護指引，從房間的實際配置提出改善建議。</p><div className="upload-steps"><p><span>01</span> 上傳照片，AI 看懂場景</p><p><span>02</span> 看見具體改善位置與原因</p><p><span>03</span> AI 改圖對照，輸出準備計畫</p></div><p className="small">建議拍下窗戶、家具與地面；植物可另補拍清楚特徵。未拍到不代表全屋缺少。</p></aside></div>
      {photo && (
        <>
          <div className="analysis-controls">
          <p className="small">只有你選擇使用 AI 分析時，才會將照片傳送至 Azure。請避免上傳包含人臉、地址或私人文件的照片。</p>
          <label className="checkline">
            <input
              type="checkbox"
              checked={consent}
              disabled={isDemo || busy}
              onChange={(e) => onConsent(e.target.checked)}
            />
            我同意將這張照片傳送至 Azure
            進行場景分析；請避免包含人臉、地址及私人文件。
          </label>
          <div className="row">
            <button
              className="primary"
              disabled={!consent || busy || isDemo || uploading}
              onClick={() => void onAnalyze()}
            >
              {busy ? "分析中…" : "使用 AI 理解場景"}
            </button>
            <button className="secondary" onClick={() => onNext()}>
              {isDemo ? '查看示範建議 →' : '選用：手動補充 →'}
            </button>
          </div>
          <p className="small">
            {isDemo
              ? "示意圖不送至 AI。"
              : busy
                ? "你仍可切換人工操作；更換照片或切到背景會取消分析。"
                : "只有按下分析才會傳送照片。重新整理會清除本次資料。"}
          </p></div>
        </>
      )}
    </section>
  );
}
