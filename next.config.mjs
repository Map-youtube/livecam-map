/** @type {import('next').NextConfig} */
const nextConfig = {
  // firebase-admin(및 서브패키지)을 서버 번들에 포함하지 않고 런타임 require 로 사용한다.
  // Vercel 서버리스 함수에서 firebase-admin/auth 서브패키지 로딩이 실패해
  // 인증 관련 라우트가 500 나던 문제를 방지한다.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
