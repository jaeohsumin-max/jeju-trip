// 에이전트 도구: find_spots (area 와 indoor 로 장소를 찾아요)
// 주의: api/ 폴더의 파일은 Vercel 이 주소(/api/tools)로 열어 버려요. 그래서 아래처럼 함수로 내보내고,
//       요청이 오면 404 만 돌려줘요. 도구는 이름 붙은 값(findSpots, findSpotsTool)으로 가져다 쓰세요.
const data = require('../data/jeju_spots.json');

const AREAS = ['동쪽', '서쪽', '서귀포', '제주시'];
const MAX_RESULTS = 8;

// Claude 에게 알려 줄 도구 설명
const findSpotsTool = {
  name: 'find_spots',
  description:
    '제주 장소 목록에서 지역(area)으로 장소를 찾아 이름, 지역, 실내 여부, 설명을 최대 ' + MAX_RESULTS + '곳까지 돌려줍니다. ' +
    'indoor 를 true 로 주면 실내 장소만, false 로 주면 야외 장소만 찾고, 생략하면 모두 찾습니다. ' +
    '이 목록 밖의 장소는 없습니다. 결과에 없는 장소는 추천하거나 지어내지 말고, 결과가 비어 있으면 없다고 말하세요.',
  input_schema: {
    type: 'object',
    properties: {
      area: { type: 'string', enum: AREAS, description: '찾을 지역: 동쪽, 서쪽, 서귀포, 제주시 중 하나' },
      indoor: { type: 'boolean', description: '선택. true 면 실내 장소만, false 면 야외 장소만. 생략하면 둘 다' },
    },
    required: ['area'],
  },
};

// 도구 실행. 좌표는 화면용이라 돌려주지 않아요.
function findSpots(input) {
  const area = input && input.area;
  if (!AREAS.includes(area)) {
    return { error: 'area 는 ' + AREAS.join(', ') + ' 중 하나여야 합니다.' };
  }
  const indoor = input && typeof input.indoor === 'boolean' ? input.indoor : undefined;
  const matched = data.spots.filter((s) => s.region === area && (indoor === undefined || s.indoor === indoor));
  const spots = matched.slice(0, MAX_RESULTS).map((s) => ({
    name: s.name,
    area: s.region,
    indoor: s.indoor,
    description: s.note,
  }));
  return { area, count: spots.length, truncated: matched.length > MAX_RESULTS, spots };
}

module.exports = (req, res) => res.status(404).end();
module.exports.findSpotsTool = findSpotsTool;
module.exports.findSpots = findSpots;
