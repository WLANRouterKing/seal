import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QRCodeSVG } from 'qrcode.react'
import { LabScenario } from './lab-scenario.mjs'
import { openDeviceDatabase } from './device-vault.mjs'
import './lab.css'

function App() {
  const [lab, setLab] = useState(null)
  const [database, setDatabase] = useState(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [phoneConfirmed, setPhoneConfirmed] = useState(false)
  const [browserConfirmed, setBrowserConfirmed] = useState(false)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('Hallo vom Browser')
  const [devices, setDevices] = useState([])
  const [, rerender] = useState(0)
  async function act(action) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setBusy(false)
      rerender((n) => n + 1)
    }
  }
  async function start() {
    const db = await openDeviceDatabase()
    const next = new LabScenario()
    try {
      await next.prepare(db, password)
    } catch (e) {
      db.close()
      throw e
    }
    setPassword('')
    setDatabase(db)
    setLab(next)
  }
  return (
    <main>
      <header>
        <span className="brand">SEAL / LAB</span>
        <span className="badge">Experimentell</span>
      </header>
      <h1>Ein Account. Eigene Geräteschlüssel.</h1>
      <p className="intro">
        Lokales Testlabor mit simuliertem Hauptgerät, Browser und Gesprächspartner. Keine echten Accounts, keine
        öffentlichen Relays.
      </p>
      <aside>
        Die QR-Anzeige demonstriert die Kopplungsanfrage. Dieses Labor verbindet noch keine zwei realen Geräte. Es ist
        kein freigegebenes Sicherheitsprodukt.
      </aside>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <fieldset disabled={busy}>
        {!lab ? (
          <section>
            <h2>Test starten</h2>
            <label>
              Passwort für den verschlüsselten Browser-Speicher
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mindestens 12 Zeichen"
              />
            </label>
            <button disabled={password.length < 12} onClick={() => act(start)}>
              Testgeräte anlegen
            </button>
          </section>
        ) : (
          <>
            <div className="grid">
              <section>
                <h2>Hauptgerät</h2>
                <p>{lab.offline ? 'Offline · Account-Signer gesperrt' : 'Online'}</p>
                {lab.phase === 'pending' && <p className="code">{lab.confirmation}</p>}
                {lab.phase === 'pending' && (
                  <label>
                    <input
                      type="checkbox"
                      checked={phoneConfirmed}
                      onChange={(e) => setPhoneConfirmed(e.target.checked)}
                    />{' '}
                    Code am Hauptgerät geprüft
                  </label>
                )}
                {lab.phase === 'linked' && (
                  <button className="secondary" onClick={() => act(() => lab.setPhoneOffline(!lab.offline))}>
                    {lab.offline ? 'Hauptgerät einschalten' : 'Hauptgerät ausschalten'}
                  </button>
                )}
              </section>
              <section>
                <h2>Browser</h2>
                <p>
                  {lab.locked ? 'Gesperrt' : 'Entsperrt'} · {lab.phase}
                </p>
                {lab.phase === 'pending' && (
                  <>
                    <QRCodeSVG value={JSON.stringify(lab.request)} size={240} marginSize={3} />
                    <p className="code">{lab.confirmation}</p>
                    <label>
                      <input
                        type="checkbox"
                        checked={browserConfirmed}
                        onChange={(e) => setBrowserConfirmed(e.target.checked)}
                      />{' '}
                      Gleichen Code im Browser geprüft
                    </label>
                    <button
                      disabled={!phoneConfirmed || !browserConfirmed}
                      onClick={() =>
                        act(async () => {
                          await lab.pair(
                            phoneConfirmed ? lab.confirmation : '',
                            browserConfirmed ? lab.confirmation : ''
                          )
                          setDevices(await lab.devices())
                        })
                      }
                    >
                      Kopplung im Labor bestätigen
                    </button>
                  </>
                )}
                {lab.phase === 'linked' &&
                  (lab.locked ? (
                    <>
                      <label>
                        Browser-Passwort
                        <input
                          type="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </label>
                      <button
                        onClick={() =>
                          act(async () => {
                            await lab.unlock(password)
                            setPassword('')
                          })
                        }
                      >
                        Entsperren und Zustand laden
                      </button>
                    </>
                  ) : (
                    <button
                      className="secondary"
                      onClick={() =>
                        act(async () => {
                          await lab.lock()
                          setMessages([])
                          setPassword('')
                        })
                      }
                    >
                      Browser sperren
                    </button>
                  ))}
              </section>
            </div>
            {lab.phase === 'linked' && !lab.locked && (
              <section>
                <h2>Nachrichten testen</h2>
                <label>
                  Testnachricht
                  <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
                </label>
                <button
                  disabled={!text.trim()}
                  onClick={() =>
                    act(async () => {
                      const result = await lab.exchange(text)
                      setMessages((previous) => [...previous, result])
                    })
                  }
                >
                  Senden und Antwort empfangen
                </button>
                <div aria-live="polite">
                  {messages.map((m, i) => (
                    <div key={i} className="messages">
                      <p>Browser → Kontakt: {m.sent}</p>
                      <p>Kontakt → Browser: {m.received}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {devices.length > 0 && (
              <section>
                <h2>Geräteverwaltung</h2>
                <p>
                  Entfernung gilt für die Testgruppe. Bereits empfangene Inhalte werden nicht aus der Ferne gelöscht.
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Gerät</th>
                      <th>Chat-Status</th>
                      <th>Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((device) => (
                      <tr key={device.id}>
                        <td>{device.label}</td>
                        <td>{device.chats.map((chat) => chat.status).join(', ')}</td>
                        <td>
                          <button
                            className="danger"
                            disabled={lab.offline || lab.phase !== 'linked'}
                            onClick={() =>
                              act(async () => {
                                try {
                                  await lab.remove()
                                  setMessages([])
                                } finally {
                                  setDevices(await lab.devices())
                                }
                              })
                            }
                          >
                            Browser entfernen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
            <button
              className="secondary"
              onClick={() =>
                act(async () => {
                  await lab.erase()
                  database?.close()
                  setDatabase(null)
                  setLab(null)
                  setDevices([])
                  setMessages([])
                  setPhoneConfirmed(false)
                  setBrowserConfirmed(false)
                  setPassword('')
                })
              }
            >
              Testdaten dieses Durchlaufs löschen
            </button>
          </>
        )}
      </fieldset>
      <footer>
        Schließen der Seite beendet die Simulation. Zum vollständigen Aufräumen vorher die Testdaten löschen. Die
        produktive Seal-App verwendet einen anderen Speicher.
      </footer>
    </main>
  )
}
createRoot(document.getElementById('root')).render(<App />)
