import { useEffect } from 'react';

// 화면마다 브라우저 탭 제목 바꾸기
export function useTitle(title) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

// profile.html 이 이 기기에 저장하는 곳
export const PROFILE_KEY = 'jeju-oreum-profile';

// Pixabay 사진 주소만 화면에 써요 (서버가 한 번 거르지만 화면에서도 한 번 더)
export function safePixabayUrl(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === 'https:' && (x.hostname === 'pixabay.com' || x.hostname.endsWith('.pixabay.com')) ? x.href : '';
  } catch (e) {
    return '';
  }
}
