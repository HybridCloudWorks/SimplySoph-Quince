'use strict';
(() => {
  const panel = document.getElementById('rsvp-app');
  const sampleGuests = [{ id: 'sample-1', name: 'Alex · sample guest' }, { id: 'sample-2', name: 'Jordan · sample guest' }];
  const events = [{ id: 'ceremony', label: 'Ceremony' }, { id: 'dinner', label: 'Dinner' }, { id: 'dance', label: 'Reception & dance' }];
  let draft = null;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function focusHeading() { const h = panel.querySelector('h3'); h.tabIndex = -1; h.focus(); }
  function bindLookup() {
    document.getElementById('lookup-form').addEventListener('submit', e => {
      e.preventDefault();
      if (document.getElementById('invite-code').value.trim().toUpperCase() !== 'SOPHIA-DEMO') {
        document.getElementById('lookup-error').textContent = 'This preview accepts only SOPHIA-DEMO. Live invitations are not connected yet.';
        return;
      }
      renderForm();
    });
  }
  function renderForm() {
    panel.innerHTML = `<h3>The sample household</h3><p>Two invited guests. Choose an answer for each event. This is a demonstration only.</p><form id="response-form">${sampleGuests.map(g => `<div class="guest-row"><h4>${g.name}</h4><div class="attendance-grid">${events.map(event => `<div><label for="${g.id}-${event.id}">${event.label}</label><select required id="${g.id}-${event.id}" name="${g.id}-${event.id}"><option value="">Choose…</option><option value="yes">Will attend</option><option value="no">Cannot attend</option></select></div>`).join('')}</div></div>`).join('')}<div class="contact-grid"><div><label for="email">Sample email (optional)</label><input type="email" id="email" name="email" maxlength="254" placeholder="alex@example.com" autocomplete="off"></div><div><label for="phone">Sample phone (optional)</label><input type="tel" id="phone" name="phone" maxlength="40" autocomplete="off"></div></div><label for="address">Sample mailing address (optional)</label><textarea id="address" name="address" maxlength="500" autocomplete="off" placeholder="Only needed for mailed invitations or thank-you notes."></textarea><label for="notes">Dietary or accessibility requests (optional)</label><textarea id="notes" name="notes" maxlength="1000" placeholder="Use sample details only."></textarea><p class="muted">Nothing is sent or stored. Refreshing this page clears your sample answers.</p><div class="form-actions"><button type="submit" class="button burgundy">Review sample RSVP</button><button type="button" class="plain-button" id="reset-demo">Start over</button></div></form>`;
    if (draft) Object.entries(draft).forEach(([name,value]) => { const input=panel.querySelector(`[name="${name}"]`); if(input) input.value=value; });
    document.getElementById('response-form').addEventListener('submit', e => { e.preventDefault(); draft=Object.fromEntries(new FormData(e.target)); renderReview(); });
    document.getElementById('reset-demo').addEventListener('click', reset);
    focusHeading();
  }
  function summary() { return `<ul class="summary-list">${sampleGuests.map(g => `<li><strong>${g.name}</strong><br>${events.map(event => `${event.label}: ${draft[`${g.id}-${event.id}`] === 'yes' ? 'Attending' : 'Not attending'}`).join('<br>')}</li>`).join('')}</ul>`; }
  function renderReview() {
    panel.innerHTML=`<h3>Review your sample response</h3>${summary()}<p>Email: ${escape(draft.email || 'Not provided')}<br>Phone: ${escape(draft.phone || 'Not provided')}</p><p>Mailing address: ${escape(draft.address || 'Not provided')}</p><p>Requests: ${escape(draft.notes || 'None')}</p><p class="demo-note" style="color:var(--muted)">Demo only. Completing this step will not send an RSVP to Sophia’s family.</p><div class="form-actions"><button class="button burgundy" id="finish-demo">Finish demonstration</button><button class="plain-button" id="edit-response">Edit answers</button></div>`;
    document.getElementById('edit-response').addEventListener('click',renderForm);
    document.getElementById('finish-demo').addEventListener('click',() => {
      panel.innerHTML=`<h3>Preview complete</h3><div class="confirmation"><p><strong>No RSVP was sent or saved.</strong></p><p>Once the live connection is ready, this step will confirm that your household’s response has been received.</p>${summary()}</div><div class="form-actions"><button class="button burgundy" id="edit-response">Edit sample response</button><button class="plain-button" id="reset-demo">Start over</button></div>`;
      document.getElementById('edit-response').addEventListener('click',renderForm);document.getElementById('reset-demo').addEventListener('click',reset);focusHeading();
    }); focusHeading();
  }
  const initialHTML = panel.innerHTML;
  function reset() { draft=null; panel.innerHTML=initialHTML;bindLookup();focusHeading(); }
  bindLookup();
})();
