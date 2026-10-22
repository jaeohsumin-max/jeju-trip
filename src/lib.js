import { useEffect } from 'react';

// 화면마다 브라우저 탭 제목 바꾸기
export function useTitle(title) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

// profile.html 이 이 기기에 저장하는 곳
export const PROFILE_KEY = 'jeju-oreum-profile';
