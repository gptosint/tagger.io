// Mapbox access token is provided via MAPBOX_ACCESS_TOKEN constant directly.
const MAPBOX_ACCESS_TOKEN = "pk.eyJ1IjoiaHViaWdhZ2EiLCJhIjoiY21lZW1yNXk2MGVuZzJucXdiaXo4OXB2NiJ9.Oj5Qv049NGjIXHNx4Zo2SQ";

mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
const API_BASE_URL = '/api';
const textTags = []; // holds thread objects
const tagMarkers = [];
const userColors = new Map();
const USER_COLOR_PALETTE = ['#FF2D95', '#7A5CFF', '#00F0FF', '#FFD166', '#06D6A0', '#EF476F'];
let map = null;
let currentUserId = null;
let currentPosition = null;
let currentUserMarker = null;
let isMapInitialized = false;
let socket = null;
let isLoadingTags = false;
let lastFetchTime = 0;
let colorIndex = 0;

function distanceMeters(aLat,aLon,bLat,bLon){const R=6371000;const toRad=x=>x*Math.PI/180;const dLat=toRad(bLat-aLat);const dLon=toRad(bLon-aLon);const lat1=toRad(aLat);const lat2=toRad(bLat);const a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)*Math.sin(dLon/2);const c=2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));return R*c;}

function findNearbyThread(){if(!currentPosition)return null;for(const t of textTags){const d=distanceMeters(currentPosition.latitude,currentPosition.longitude,t.latitude,t.longitude);if(d<200)return t;}return null;}

function showError(m){const e=document.getElementById('error-container');const t=document.getElementById('error-message');if(e&&t){t.textContent=m;e.style.display='block';setTimeout(()=>{e.style.display='none';},4000);}}
function showSuccess(m){const e=document.getElementById('success-container');const t=document.getElementById('success-message');if(e&&t){t.textContent=m;e.style.display='block';setTimeout(()=>{e.style.display='none';},4000);}}
function init(){initUserSession();document.getElementById('add-tag-btn').addEventListener('click',addTextTag);initGeolocation();fetchTagsFromBackend();setInterval(fetchTagsFromBackend,30000);}document.addEventListener('DOMContentLoaded',init);
function initUserSession(){currentUserId=localStorage.getItem('geo_text_user_id');if(!currentUserId){currentUserId='user_'+Math.random().toString(36).substring(2,9);localStorage.setItem('geo_text_user_id',currentUserId);}}
function initWebSocket(){socket={send:d=>console.log('WebSocket message sent:',d),close:()=>console.log('WebSocket connection closed')};}
function initGeolocation(){if(navigator.geolocation){navigator.geolocation.getCurrentPosition(p=>{initMap(p.coords.latitude,p.coords.longitude);updateUserPosition(p);navigator.geolocation.watchPosition(updateUserPosition);},()=>{showError('Location access denied.');initMap(0,0);});}else{showError('Geolocation unsupported.');initMap(0,0);}}
function initMap(lat,lon){map=new mapboxgl.Map({container:'map',style:'mapbox://styles/hubigaga/clre95zh8008s01pfeg2j2dpo',center:[lon,lat],zoom:15});map.addControl(new mapboxgl.NavigationControl());map.on('load',()=>{isMapInitialized=true;addUserMarker(lat,lon);updateTagsList();});}
function updateUserPosition(p){const{latitude:lat,longitude:lon}=p.coords;currentPosition={latitude:lat,longitude:lon};document.getElementById('current-location').textContent=`Your position: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;if(currentUserMarker){currentUserMarker.setLngLat([lon,lat]);}else if(isMapInitialized){addUserMarker(lat,lon);}}
function fetchTagsFromBackend(){isLoadingTags=true;const loadingIndicator=document.getElementById('loading-indicator');const noTagsMessage=document.getElementById('no-tags-message');if(loadingIndicator)loadingIndicator.style.display='flex';if(noTagsMessage)noTagsMessage.style.display='none';fetch(`${API_BASE_URL}/tags`).then(res=>{if(!res.ok)throw new Error('Failed to load tags');return res.json();}).then(data=>{const incoming=Array.isArray(data)?data:[];textTags.length=0;textTags.push(...incoming.map(tag=>({latitude:Number(tag.lat),longitude:Number(tag.lng),text:String(tag.text||'').trim(),timestamp:tag.timestamp||Date.now(),userId:sanitizeUserId(tag.userId)})).filter(tag=>!Number.isNaN(tag.latitude)&&!Number.isNaN(tag.longitude)&&tag.text));resetLegendColors();updateTagsCount();updateTagsList();updateLegend();}).catch(()=>{showError('Failed to load tags');}).finally(()=>{isLoadingTags=false;if(loadingIndicator)loadingIndicator.style.display='none';if(textTags.length===0&&noTagsMessage){noTagsMessage.style.display='block';}updateLegend();});}
function addTextTag(){if(!currentPosition){showError('Wait for location.');return;}const area=document.getElementById('tag-text');const text=area.value.trim();if(!text){showError('Enter text.');return;}const sanitizedUserId=sanitizeUserId(currentUserId);const tag={userId:sanitizedUserId,latitude:currentPosition.latitude,longitude:currentPosition.longitude,text,timestamp:Date.now()};textTags.push(tag);updateTagsCount();updateTagsList();updateLegend();area.value='';showSuccess('Tag added!');uploadTagToBackend(tag);}
function uploadTagToBackend(tag){fetch(`${API_BASE_URL}/tags`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lat:tag.latitude,lng:tag.longitude,text:tag.text,userId:tag.userId})}).then(res=>{if(!res.ok)throw new Error('Request failed');return res.json();}).then(data=>{if(data&&data.success){showSuccess('Tag saved!');}else{showError('Failed to save tag');}}).catch(()=>{showError('Failed to save tag');});}
function updateTagsCount(){const el=document.getElementById('tags-count');const c=textTags.length;el.textContent=c===0?'No text tags yet':`${c} total tag${c===1?'':'s'}`;}
function updateTagsList(){const itemsContainer=document.getElementById('tags-items');if(!itemsContainer)return;itemsContainer.innerHTML='';clearTagMarkers();const noTagsMessage=document.getElementById('no-tags-message');if(textTags.length===0){if(noTagsMessage)noTagsMessage.style.display='block';return;}if(noTagsMessage)noTagsMessage.style.display='none';textTags.forEach(tag=>{const color=getColorForUser(tag.userId);const item=document.createElement('div');item.className='tag-item py-2 px-3 mb-1 rounded flex items-center';item.innerHTML=`<span class="user-dot" style="background:${color}"></span><span>${tag.text}</span><span class="ml-auto text-gray-400 text-xs">${tag.latitude.toFixed(3)}, ${tag.longitude.toFixed(3)}</span>`;item.onclick=()=>{if(map){map.flyTo({center:[tag.longitude,tag.latitude],zoom:15});}};itemsContainer.appendChild(item);addTextMarker(tag,color);});}
function clearTagMarkers(){while(tagMarkers.length){const marker=tagMarkers.pop();marker.remove();}}
function addUserMarker(lat,lon){if(!map||!isMapInitialized)return;const el=document.createElement('div');el.className='user-marker pulse-animate';currentUserMarker=new mapboxgl.Marker(el).setLngLat([lon,lat]).addTo(map);}
function addTextMarker(tag,color){
    if(!map||!isMapInitialized)return;
    const el=document.createElement('div');
    el.className='marker-dot';
    const markerColor=color||'#FF2D95';
    el.style.background=markerColor;
    el.style.boxShadow=`0 0 10px ${markerColor}`;
    const label=document.createElement('div');
    label.className='mapboxgl-marker-text';
    label.style.marginTop='4px';
    label.textContent=tag.text;
    const container=document.createElement('div');
    container.style.display='flex';
    container.style.flexDirection='column';
    container.style.alignItems='center';
    container.appendChild(el);
    container.appendChild(label);
    const marker=new mapboxgl.Marker(container)
        .setLngLat([tag.longitude,tag.latitude])
        .addTo(map);
    tagMarkers.push(marker);
}
function sanitizeUserId(id){if(typeof id!=='string')return 'anonymous';const trimmed=id.trim();if(!trimmed)return 'anonymous';return trimmed.slice(0,50);}
function getColorForUser(userId){const key=userId||'anonymous';if(!userColors.has(key)){const color=USER_COLOR_PALETTE[colorIndex%USER_COLOR_PALETTE.length];userColors.set(key,color);colorIndex+=1;}return userColors.get(key);}
function resetLegendColors(){userColors.clear();colorIndex=0;}
function updateLegend(){const legend=document.getElementById('legend-content');if(!legend)return;legend.innerHTML='';if(textTags.length===0){const empty=document.createElement('div');empty.className='legend-item';empty.innerHTML='<span class="text-gray-400 text-xs">No users yet</span>';legend.appendChild(empty);return;}const counts=new Map();textTags.forEach(tag=>{const id=sanitizeUserId(tag.userId);if(!counts.has(id)){counts.set(id,{count:0,color:getColorForUser(id)});}counts.get(id).count+=1;});counts.forEach((info,id)=>{const item=document.createElement('div');item.className='legend-item';const colorBlock=document.createElement('div');colorBlock.className='legend-color';colorBlock.style.background=info.color;item.appendChild(colorBlock);const text=document.createElement('span');const label=id==='anonymous'?'Anonymous':id;text.textContent=`${label} (${info.count})`;item.appendChild(text);legend.appendChild(item);});}
