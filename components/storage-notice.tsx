"use client";

import { useEvaluationState } from "@/lib/evaluation-store";

export function StorageNotice() {
  return useEvaluationState().storageError
    ? <p className="storage-notice" role="alert">浏览器无法保存工作区。当前更新仅保留在本次会话，刷新后可能丢失。</p>
    : null;
}
