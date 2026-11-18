import type { Evidence } from '../domain/assessment';
import type { Candidate } from '../domain/schema';
import { planAction, primaryObjectIndex } from '../domain/improvement-plan';
import { evaluateAssessment } from '../domain/assessment';
import { RULES } from '../data/knowledge';
import { useState } from 'react';
import type { ScanAction } from '../domain/scan-result';

import { photoPoint } from '../domain/photo-location';
import type { PhotoPoint } from '../domain/photo-location';

type ScanPhotoProps = {
    photo: string;
    demo: boolean;
    actions: ScanAction[];
    objectNames: string[];
    active: string | null;
    editing: string | null;
    positions: Record<string, PhotoPoint>;
    simulated: number[];
    onActivate: (id: string) => void;
    onLocate: (id: string, point: PhotoPoint) => void;
    onCancelLocate: () => void;
};

export function ScanRoomPhoto({photo, demo, actions, objectNames, active, editing, positions, simulated, onActivate, onLocate, onCancelLocate}: ScanPhotoProps) {
    const [show, setShow] = useState(true), [zoom, setZoom] = useState(1);
    const markers = actions.flatMap((action, index) => {
        const point = positions[action.id], box = action.marker_label ? null : action.bbox;
        if (!point && !box) return [];
        const name = (action.object_index === null ? null : objectNames[action.object_index]) ?? action.title;
        return [{action, number: index + 1, point, box: point ? null : box, name}];
    });
    const focused = markers.find(m => m.action.id === active);
    const target = actions.find(a => a.id === editing);
    const selected = actions.find(a => a.id === active);
    const isSimulated = (action: ScanAction) => simulated.some(index => action.id === `case-${index}`);
    const source = (id: string) => positions[id] ? '使用者確認位置' : demo ? '示範座標' : 'AI 估計位置';
    return <div className={`annotated-room scan-annotated-room ${show ? '' : 'scan-annotations-hidden'}`}>
        <div className="photo-toolbar">
            <strong>照片上的改善位置</strong>
            <div className="scan-photo-controls">
                <label>縮放 <select aria-label="照片縮放" value={zoom} onChange={event => setZoom(Number(event.target.value))}>
                    <option value={1}>100%</option><option value={1.5}>150%</option><option value={2}>200%</option>
                </select></label>
                {markers.length > 0 && <button type="button" className="text-button" aria-pressed={show} onClick={() => setShow(!show)}>顯示標記</button>}
            </div>
        </div>
        {target && <p className="scan-position-instruction" role="status">點選照片中的「{target.title}」位置。<button type="button" className="text-button" onClick={onCancelLocate}>取消定位</button></p>}
        <div className="photo-viewport" tabIndex={zoom > 1 ? 0 : undefined} aria-label="照片檢視區">
            <div className="photo-zoom" style={{width: `${zoom * 100}%`}}>
                <div className="assessment-photo plan-photo scan-photo-markers">
                    <img src={photo} alt={demo ? "虛構房間示意圖" : "本次房間照片"}/>
                    <div className="scan-hotspots">
                        {markers.map(({action, number, box, point, name}) => {
                            const x = point?.[0] ?? box![0], y = point?.[1] ?? box![1];
                            const style = {left: `${x * 100}%`, top: `${y * 100}%`};
                            return <div key={action.id} className={`scan-hotspot ${action.priority} ${isSimulated(action) ? 'simulated' : ''}`} data-selected={focused?.action.id === action.id}>
                                {box && <div className="scan-hotspot-outline" style={{...style, width: `${(box[2] - x) * 100}%`, height: `${(box[3] - y) * 100}%`}}/>}
                                <button type="button" aria-label={`標記 ${number}：${name}`} aria-pressed={focused?.action.id === action.id}
                                    tabIndex={!show || target ? -1 : undefined} onClick={() => onActivate(action.id)}
                                    style={{...style, '--marker-x': `${x * 100}%`, '--marker-y': `${y * 100}%`} as React.CSSProperties}>{number}</button>
                            </div>;
                        })}
                    </div>
                    {target && <div className="scan-location-target" onClick={event => {
                        const point = photoPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
                        if (point) { onLocate(target.id, point); setShow(true); }
                    }}/>}
                </div>
            </div>
        </div>
        {selected && <aside className="photo-callout scan-selection" aria-label="選取項目的改善建議">
            <strong>{actions.indexOf(selected) + 1} · {selected.title}</strong>
            <p>{selected.reason}</p>
            <p><strong>建議</strong> {selected.action}</p>
            <p className="small">{focused ? source(selected.id) : '此項目尚未定位'}{isSimulated(selected) ? ' · 已模擬改善' : ''}</p>
        </aside>}
        {markers.length > 0 && <div className="scan-marker-legend" aria-label="照片物品標籤">{markers.map(({action, number, name}) =>
            <button key={action.id} className="text-button" aria-pressed={focused?.action.id === action.id} onClick={() => onActivate(action.id)}>
                {number} · {name} <small>{source(action.id)}{isSimulated(action) ? ' · 已模擬改善' : ''}</small>
            </button>)}</div>}
    </div>;
}


export default function RoomPhoto({ photo, evidence, objects, selected = [], after = false, active, onActivate }: {
    photo: string;
    evidence: Evidence;
    objects: Candidate['objects'];
    selected?: number[];
    after?: boolean;
    active?: number | null;
    onActivate?: (index: number) => void;
}) {
    const [localActive, setLocalActive] = useState<number | null>(null);
    const [zoom, setZoom] = useState(1);
    const requested = active ?? localActive;
    const findings = evaluateAssessment(evidence);
    const candidates = evidence.cases.flatMap((item, index) => {
        if (after && !selected.includes(index)) return [];
        const primary = primaryObjectIndex(item, objects);
        const placement = after ? item.proposal?.placement : null;
        const box = placement?.bbox ?? (primary === null ? null : objects[primary]?.bbox);
        if (!box) return [];
        const label = placement
            ? item.rule_id === 'H11' ? '新增躲藏處' : `改善位置：${RULES.find(r => r.rule_id === item.rule_id)!.title}`
            : objects[primary!].label;
        return [{ index, primary, box, label, item, status: findings[index].status }];
    });
    // A supporting object or multiple rules on one object must not create stacked labels.
    const markers = candidates.filter((entry, _, all) => {
        const group = all.filter(x => x.box.join(',') === entry.box.join(','));
        const chosen = group.find(x => x.index === requested)
            ?? group.find(x => ['CONFIRMED_RISK', 'POTENTIAL_RISK'].includes(x.status))
            ?? group[0];
        return chosen.index === entry.index;
    });
    const focused = active != null ? markers.find(x => x.index === active) : markers.find(x => x.index === requested) ?? markers[0];
    const anchor = focused ? (focused.box[0] + focused.box[2]) * 50 : 0;
    const activate = (index: number) => { setLocalActive(index); onActivate?.(index); };
    return <div className={`annotated-room ${after ? 'annotated-room-after' : ''}`}>
        <div className="photo-toolbar"><strong>房間照片</strong><div><label><span className="sr-only">照片縮放</span><select value={zoom} onChange={e => setZoom(Number(e.target.value))}><option value={1}>100%</option><option value={1.5}>150%</option><option value={2}>200%</option></select></label><button type="button" className="text-button" onClick={() => setZoom(1)}>重設檢視</button></div><span className="photo-mode">{after ? '假設示意' : '原始觀察'}</span></div>
        <div className="photo-viewport" tabIndex={zoom > 1 ? 0 : undefined} aria-label="照片檢視區"><div className="photo-zoom" style={{width:`${zoom * 100}%`}}>
        <div className="assessment-photo plan-photo">
            <img src={photo} alt={after ? '原照片上的假設改善位置示意，非改裝照片' : '改善前的原始照片'}/>
            {focused && <svg className="photo-leader" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <path d={`M ${anchor} ${focused.box[3] * 100} V 100`} />
                <circle cx={anchor} cy={focused.box[3] * 100} r=".7" />
            </svg>}
            {markers.map(marker => <button key={marker.index} type="button"
                className={`assessment-marker status-${marker.status} ${after ? 'planned' : ''}`}
                aria-label={`標記 ${(marker.primary ?? marker.index) + 1}：${marker.label}`}
                aria-pressed={focused?.index === marker.index}
                onClick={() => activate(marker.index)}
                style={{ left: `${marker.box[0] * 100}%`, top: `${marker.box[1] * 100}%`, width: `${(marker.box[2] - marker.box[0]) * 100}%`, height: `${(marker.box[3] - marker.box[1]) * 100}%` }}>
                <span style={marker.box[0] > .7 ? { left:'auto', right:0 } : undefined}>{marker.label}</span>
            </button>)}
        </div></div></div>
        {focused && <>
            <svg className="photo-leader-bridge" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path d={`M ${anchor} 0 V 12 H 30 V 24`} /></svg>
            <aside className="photo-callout" role="note" aria-label={`${focused.label}的改善建議`}>
                <strong>{focused.label}{after ? ' · 假設改善' : ' · 改善建議'}</strong>
                <p>{planAction(focused.item).split(/[。；]/u)[0]}。</p>
            </aside>
        </>}
    </div>;
}
