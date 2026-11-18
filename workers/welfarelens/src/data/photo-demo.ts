import { CandidateSchema } from '../domain/schema';

export const PHOTO_DEMO = CandidateSchema.parse({
    image_quality: 'adequate',
    objects: [
        {kind:'window', label:'示範窗戶', bbox:[.11,.08,.48,.57], notes:'虛構圖中的窗戶與鄰近沙發。'},
        {kind:'plant', label:'示範盆栽', bbox:[.66,.36,.85,.83], notes:'虛構圖中的盆栽。'},
    ],
    questions: [],
    limitations: ['虛構場景與測試資料。'],
    assessments: [{
        rule_id:'H01', object_indices:[0],
        facts:[
            {key:'opening_visible', value:true, status:'OBSERVATION', evidence:'示範設定中可見窗戶。', confidence:'medium'},
            {key:'access_route', value:true, status:'INFERENCE', evidence:'示範設定中沙發可能提供攀爬路徑。', confidence:'medium'},
        ],
    }],
});
