import { useNavigate } from 'react-router-dom';
import PhotoSheet from '../Photos.jsx';
import { useTitle } from '../lib.js';
import './Agent.css';

// /photos : 소개 화면의 '제주 사진' 버튼이 여는 사진 화면 (채팅 화면과 같은 휴대폰 틀 안에 보여 줘요)
export default function PhotosPage() {
  useTitle('제주 사진 | 제주 오름이');
  const navigate = useNavigate();
  return (
    <div className="p-agent">
      <div className="phone">
        <PhotoSheet onClose={() => navigate('/')} />
      </div>
    </div>
  );
}
