"use client";

import { Component, useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./mini3d.module.css";

export function Mini3DModal({ title, onCancel, children }: {
  title: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    node?.querySelector("h2")?.focus();
    return () => node?.close();
  }, []);

  return (
    <dialog ref={dialog} className={styles.modal} aria-labelledby={titleId} onCancel={event => {
      event.preventDefault();
      onCancel();
    }}>
      <header className={styles.header}>
        <h2 id={titleId} tabIndex={-1}>{title}</h2>
        <button className="btn" type="button" onClick={onCancel}>取消</button>
      </header>
      <SceneBoundary>{children}</SceneBoundary>
    </dialog>
  );
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <p role="alert">無法開啟 3D 場景。請確認瀏覽器已啟用 WebGL，或按取消回到遊戲。</p>
      : this.props.children;
  }
}
