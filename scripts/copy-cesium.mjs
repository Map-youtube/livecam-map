// ─────────────────────────────────────────────────────────────
// copy-cesium.mjs — Cesium 정적 자산을 public/cesium 으로 복사
//
// Cesium 은 런타임에 CESIUM_BASE_URL 경로에서 Web Worker/텍스처/위젯 자산을 로드한다.
// node_modules/cesium/Build/Cesium 의 Workers/Assets/ThirdParty/Widgets 를
// public/cesium 으로 복사해 두면, 앱에서 window.CESIUM_BASE_URL = "/cesium" 로 로드할 수 있다.
//
// postinstall(설치 후)에 실행되어 로컬/Vercel 어디서든 자동으로 자산이 준비된다.
// public/cesium 은 .gitignore 로 제외(용량 큼) — 이 스크립트가 대신 생성한다.
//
// ⚠️ Ion 미사용: Cesium Ion 토큰/자산은 전혀 참조하지 않는다. 로컬 정적 자산만 복사한다.
// ─────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, cpSync } from "node:fs";
import { join } from "node:path";

try {
  const src = join(process.cwd(), "node_modules", "cesium", "Build", "Cesium");
  const dest = join(process.cwd(), "public", "cesium");

  // cesium 이 설치되지 않았으면(자산 없음) 조용히 종료 (빌드를 막지 않음)
  if (!existsSync(src)) {
    console.warn("[copy-cesium] cesium 빌드 자산을 찾을 수 없습니다:", src);
    process.exit(0);
  }

  mkdirSync(dest, { recursive: true });

  for (const dir of ["Workers", "Assets", "ThirdParty", "Widgets"]) {
    const s = join(src, dir);
    const d = join(dest, dir);
    if (existsSync(s)) {
      cpSync(s, d, { recursive: true });
      console.log("[copy-cesium] copied", dir);
    }
  }

  // 프리빌드 Cesium.js (window.Cesium) — 앱은 이 파일을 <script>로 로드한다.
  // (import 로 번들링하면 Turbopack 이 대용량 소스를 처리하다 매우 느려지므로,
  //  정적 파일로 서빙하고 런타임에 스크립트 태그로 로드한다.)
  const cesiumJs = join(src, "Cesium.js");
  if (existsSync(cesiumJs)) {
    cpSync(cesiumJs, join(dest, "Cesium.js"));
    console.log("[copy-cesium] copied Cesium.js");
  }

  console.log("[copy-cesium] 완료");
} catch (error) {
  // 복사 실패해도 전체 빌드를 막지 않도록 정상 종료 처리
  console.error("[copy-cesium] 복사 실패:", error);
  process.exit(0);
}
