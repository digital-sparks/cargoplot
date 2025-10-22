(()=>{window.Webflow||(window.Webflow=[]);window.Webflow.push(()=>{let r={API_URL:"https://app.cargoplot.com/api/bookings/sea?limit=5",PROXY_URL:"https://corsproxy.io/?",TIMEOUT:1e4,MAX_RETRIES:3,RETRY_DELAY:1e3,DEBUG:!1},c=(...e)=>{r.DEBUG&&console.log("[BookingsTable]",...e)},s=(...e)=>{r.DEBUG&&console.error("[BookingsTable]",...e)},f=e=>new Promise(t=>setTimeout(t,e));function u(e){e.innerHTML=`
      <tr class="fs-table_row">
        <td class="fs-table_cell" colspan="4" style="text-align: center; padding: 2rem;">
          <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
            <div style="width: 16px; height: 16px; border: 2px solid #f3f3f3; border-top: 2px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            Loading bookings...
          </div>
        </td>
      </tr>
    `}function b(e,t){e.innerHTML=`
      <tr class="fs-table_row">
        <td class="fs-table_cell" colspan="4" style="text-align: center; padding: 2rem; color: #e74c3c;">
          <div>
            <strong>Unable to load bookings</strong><br>
            <small>${t}</small><br>
            <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
              Try Again
            </button>
          </div>
        </td>
      </tr>
    `}async function m(e,t={}){let o=new AbortController,n=setTimeout(()=>o.abort(),r.TIMEOUT);try{let a=await fetch(e,{...t,signal:o.signal});return clearTimeout(n),a}catch(a){throw clearTimeout(n),a}}async function d(e=0){try{let t=r.API_URL,o=r.PROXY_URL+encodeURIComponent(t);c(`Fetching bookings (attempt ${e+1}):`,t);let n=await m(o,{headers:{Accept:"application/json","Content-Type":"application/json"}});if(!n.ok)throw new Error(`API returned ${n.status}: ${n.statusText}`);let a=await n.json();if(!Array.isArray(a))throw new Error("Invalid response format: expected array");return a}catch(t){if(s("Fetch attempt failed:",t.message),e<r.MAX_RETRIES)return c(`Retrying in ${r.RETRY_DELAY}ms... (${e+1}/${r.MAX_RETRIES})`),await f(r.RETRY_DELAY*(e+1)),d(e+1);throw t}}function g(e){return typeof e!="string"?String(e||""):e.trim().substring(0,100)}function h(e,t){let o=document.createDocumentFragment();t.forEach((n,a)=>{if(!n||typeof n!="object"){s(`Invalid booking at index ${a}:`,n);return}let i=document.createElement("tr");i.className="fs-table_row",i.setAttribute("data-booking-index",a),["from","to","size","booked"].forEach(p=>{let l=document.createElement("td");l.className="fs-table_cell",l.textContent=g(n[p]),l.setAttribute("data-field",p),i.appendChild(l)}),o.appendChild(i)}),e.innerHTML="",e.appendChild(o),c(`Successfully populated table with ${t.length} bookings`)}async function y(){let e=document.querySelector(".fs-table_body");if(!e){s("Table body element not found (.fs-table_body)");return}try{u(e);let t=await d();if(t.length===0){e.innerHTML=`
          <tr class="fs-table_row">
            <td class="fs-table_cell" colspan="4" style="text-align: center; padding: 2rem;">
              No bookings available at this time
            </td>
          </tr>
        `;return}h(e,t)}catch(t){s("Failed to populate bookings table:",t);let o="Please try again later";t.name==="AbortError"?o="Request timed out":t.message.includes("Failed to fetch")?o="Network connection issue":t.message.includes("API returned")&&(o="Service temporarily unavailable"),b(e,o)}}if(!document.querySelector("#bookings-table-styles")){let e=document.createElement("style");e.id="bookings-table-styles",e.textContent=`
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `,document.head.appendChild(e)}y()});})();
