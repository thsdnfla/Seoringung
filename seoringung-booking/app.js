const calendar = document.querySelector('#calendar');
const monthLabel = document.querySelector('#month-label');
const timeSlots = document.querySelector('#time-slots');
const timeTitle = document.querySelector('#time-title');
const summary = document.querySelector('#selection-summary');
let shown = new Date(); shown.setDate(1);
let chosenDate = null, chosenTime = null, consultationType = '개인 상담', consultationPrice = '100,000원';
const blocked = { '2026-09-08': ['11:00', '15:00'], '2026-09-10': ['13:00'] };
const pad = n => String(n).padStart(2, '0');
const key = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const koreanDate = d => `${d.getMonth()+1}월 ${d.getDate()}일 (${['일','월','화','수','목','금','토'][d.getDay()]})`;
function renderCalendar(){
  calendar.innerHTML=''; monthLabel.textContent=`${shown.getFullYear()}년 ${shown.getMonth()+1}월`;
  const today=new Date(); today.setHours(0,0,0,0); const start=new Date(shown.getFullYear(),shown.getMonth(),1); const end=new Date(shown.getFullYear(),shown.getMonth()+1,0);
  for(let i=0;i<start.getDay();i++) calendar.insertAdjacentHTML('beforeend','<span></span>');
  for(let day=1;day<=end.getDate();day++){
    const date=new Date(shown.getFullYear(),shown.getMonth(),day), isSunday=date.getDay()===0, past=date<today;
    const button=document.createElement('button'); button.textContent=day; button.disabled=isSunday||past; if(isSunday) button.className='sunday';
    if(chosenDate && key(date)===key(chosenDate)) button.classList.add('selected');
    button.addEventListener('click',()=>{chosenDate=date;chosenTime=null;renderCalendar();renderTimes();updateSummary()}); calendar.append(button);
  }
}
function renderTimes(){
  timeSlots.innerHTML=''; if(!chosenDate){timeTitle.textContent='날짜를 먼저 선택해 주세요';return} timeTitle.textContent=`${koreanDate(chosenDate)} · 60분 상담`;
  const unavailable=blocked[key(chosenDate)]||[];
  for(let h=10;h<19;h++){const time=`${pad(h)}:00`, button=document.createElement('button');button.textContent=`${time} — ${pad(h+1)}:00`;button.disabled=unavailable.includes(time);if(chosenTime===time)button.classList.add('selected');button.addEventListener('click',()=>{chosenTime=time;renderTimes();updateSummary()});timeSlots.append(button)}
}
function updateSummary(){summary.textContent=chosenDate&&chosenTime?`${consultationType} · ${consultationPrice} · ${koreanDate(chosenDate)} ${chosenTime}–${pad(Number(chosenTime.slice(0,2))+1)}:00`:'상담 종류와 시간을 선택해 주세요.'}
document.querySelectorAll('.type-option').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.type-option').forEach(b=>b.classList.remove('selected'));button.classList.add('selected');consultationType=button.dataset.type;consultationPrice=button.dataset.price;updateSummary()}));
document.querySelector('#previous-month').addEventListener('click',()=>{shown.setMonth(shown.getMonth()-1);renderCalendar()});document.querySelector('#next-month').addEventListener('click',()=>{shown.setMonth(shown.getMonth()+1);renderCalendar()});
document.querySelector('#booking-form').addEventListener('submit',event=>{event.preventDefault();if(!chosenDate||!chosenTime){summary.textContent='날짜와 시간을 모두 선택해 주세요.';return}const selectedKey=key(chosenDate);if((blocked[selectedKey]||[]).includes(chosenTime)){summary.textContent='방금 다른 예약이 접수된 시간입니다. 다른 시간을 선택해 주세요.';renderTimes();return}const name=new FormData(event.target).get('bookerName');(blocked[selectedKey]??=[]).push(chosenTime);document.querySelector('#success-copy').textContent=`${name}님, ${consultationType} (${consultationPrice} · ${koreanDate(chosenDate)} ${chosenTime}) 예약 요청이 접수되었습니다. 해당 시간은 모든 상담에 공통으로 마감 처리되었습니다. 확인 후 연락드리겠습니다.`;document.querySelector('#success-dialog').showModal();event.target.reset();chosenTime=null;renderTimes();updateSummary()});
document.querySelector('#close-success').addEventListener('click',()=>document.querySelector('#success-dialog').close());
renderCalendar();renderTimes();updateSummary();
