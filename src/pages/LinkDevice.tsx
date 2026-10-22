import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Code,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { QRCodeSVG } from 'qrcode.react'
import { npubToPubkey, pubkeyToNpub } from '../services/keys'
import { CompanionSession, type CompanionState, type DeviceChat, type DeviceMessage } from '../services/devices/session'
import { LinkedVault, hasLinkedVault, deleteLinkedVault } from '../services/devices/storage'
import { DeviceTransport, exclusiveDeviceSession } from '../services/devices/transport'
import { inspectRequest, makeRequest, newDeviceSecret, now, randomId } from '../services/devices/protocol'

type Phase = 'loading' | 'setup' | 'locked' | 'pairing' | 'grant' | 'linked' | 'removed'
export default function LinkDevice() {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('loading')
  const [name, setName] = useState('')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [qr, setQR] = useState('')
  const [code, setCode] = useState('')
  const [chats, setChats] = useState<DeviceChat[]>([])
  const [peer, setPeer] = useState('')
  const [newPeer, setNewPeer] = useState('')
  const [messages, setMessages] = useState<DeviceMessage[]>([])
  const [draft, setDraft] = useState('')
  const [eraseConfirm, setEraseConfirm] = useState(false)
  const session = useRef<CompanionSession | undefined>(undefined)
  const vault = useRef(new LinkedVault<CompanionState>())
  const release = useRef<(() => void) | undefined>(undefined)
  const alive = useRef(true)
  const working = useRef(false)
  const epoch = useRef(0)
  const lock = useCallback(() => {
    epoch.current++
    session.current?.close()
    session.current = undefined
    vault.current.lock()
    release.current?.()
    release.current = undefined
    setPassword('')
    setRepeat('')
    setMessages([])
    setChats([])
    setPeer('')
    setDraft('')
    setQR('')
    setCode('')
    setConfirmed(false)
    setPhase('locked')
  }, [])
  useEffect(() => {
    alive.current = true
    const currentVault = vault.current
    hasLinkedVault()
      .then((exists) => {
        if (alive.current) setPhase(exists ? 'locked' : 'setup')
      })
      .catch(() => {
        if (alive.current) setError(t('devices.storageFailed'))
      })
    let timer: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(lock, 5 * 60 * 1000)
    }
    const hidden = () => {
      if (document.hidden && session.current) lock()
    }
    window.addEventListener('pointerdown', reset)
    window.addEventListener('keydown', reset)
    document.addEventListener('visibilitychange', hidden)
    reset()
    return () => {
      alive.current = false
      clearTimeout(timer)
      window.removeEventListener('pointerdown', reset)
      window.removeEventListener('keydown', reset)
      document.removeEventListener('visibilitychange', hidden)
      session.current?.close()
      currentVault.lock()
      release.current?.()
    }
  }, [lock, t])
  const connect = (state: CompanionState) => {
    const info = state.confirmed
      ? undefined
      : inspectRequest(JSON.stringify(state.request), state.host ? state.request.created_at : now())
    setAccount(pubkeyToNpub(state.account))
    if (info) {
      setQR(JSON.stringify(state.request))
      setCode(info.code)
    }
    session.current = new CompanionSession(
      state,
      vault.current,
      (urls) => new DeviceTransport(urls),
      (status) => {
        if (!alive.current) return
        if (status === 'removed') {
          lock()
          setPhase('removed')
        } else setPhase('grant')
      }
    )
    setPhase(state.confirmed ? 'linked' : state.host ? 'grant' : 'pairing')
  }
  const perform = async (action: () => Promise<void>) => {
    if (working.current) return
    working.current = true
    setBusy(true)
    setError('')
    const issued = epoch.current
    try {
      await action()
    } catch (err) {
      if (alive.current && issued === epoch.current) setError((err as Error).message)
    } finally {
      working.current = false
      if (alive.current) setBusy(false)
    }
  }
  const start = () =>
    perform(async () => {
      const issued = epoch.current
      const unlock = await exclusiveDeviceSession('companion')
      if (!alive.current || issued !== epoch.current) {
        unlock()
        return
      }
      release.current = unlock
      try {
        let state: CompanionState
        if (phase === 'locked') state = await vault.current.unlock(password)
        else {
          const pubkey = npubToPubkey(account.trim())
          if (!pubkey || !name.trim() || password.length < 12 || password !== repeat)
            throw new Error(t('devices.invalidSetup'))
          const secret = newDeviceSecret()
          const request = makeRequest(secret, {
            account: pubkey,
            name: name.trim(),
            relays: ['wss://nos.lol'],
            expires: now() + 300,
            session: randomId(),
          })
          state = { account: pubkey, secret, request, confirmed: false, seq: 0 }
          await vault.current.create(password, state)
        }
        if (!alive.current || issued !== epoch.current) {
          vault.current.lock()
          return
        }
        setPassword('')
        setRepeat('')
        connect(state)
      } catch (err) {
        vault.current.lock()
        release.current?.()
        release.current = undefined
        throw err
      }
    })
  const refresh = useCallback(async () => {
    const client = session.current
    if (!client) return
    const result = peer ? await client.request('history', { peer }) : await client.request('chats', null)
    if (session.current !== client || !alive.current) return
    if (peer) setMessages(result as DeviceMessage[])
    else setChats(result as DeviceChat[])
  }, [peer])
  useEffect(() => {
    if (phase !== 'linked') return
    const update = () => {
      if (!working.current) void perform(refresh)
    }
    update()
    const timer = setInterval(update, 15000)
    return () => clearInterval(timer)
    // perform deliberately uses refs to serialize foreground and background requests.
  }, [phase, refresh])
  return (
    <Stack p="md" maw={720} mx="auto" style={{ minHeight: '100dvh' }}>
      <Group justify="space-between">
        <Text size="xl" fw={700}>
          {t('devices.companionTitle')}
        </Text>
        <Anchor component={Link} to="/">
          {t('common.back')}
        </Anchor>
      </Group>
      <Alert color="blue">{t('devices.primaryRequired')}</Alert>
      {error && <Alert color="red">{error}</Alert>}
      {(phase === 'setup' || phase === 'locked') && (
        <Stack>
          {phase === 'setup' && (
            <>
              <TextInput
                label={t('devices.deviceName')}
                value={name}
                maxLength={60}
                onChange={(event) => setName(event.currentTarget.value)}
              />
              <TextInput
                label={t('devices.account')}
                placeholder="npub1…"
                value={account}
                onChange={(event) => setAccount(event.currentTarget.value)}
              />
              <Text size="sm">{t('devices.relayNotice')}</Text>
            </>
          )}
          <PasswordInput
            label={t('devices.password')}
            value={password}
            autoComplete={phase === 'setup' ? 'new-password' : 'current-password'}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
          {phase === 'setup' && (
            <PasswordInput
              label={t('devices.repeatPassword')}
              value={repeat}
              autoComplete="new-password"
              onChange={(event) => setRepeat(event.currentTarget.value)}
            />
          )}
          <Button
            loading={busy}
            disabled={
              password.length < 12 || (phase === 'setup' && (!name.trim() || !account.trim() || password !== repeat))
            }
            onClick={start}
          >
            {t(phase === 'setup' ? 'devices.createQR' : 'devices.unlock')}
          </Button>
        </Stack>
      )}
      {(phase === 'pairing' || phase === 'grant') && (
        <Stack align="center">
          <Text>{t('devices.showQR')}</Text>
          <Paper p="sm" bg="white" style={{ maxWidth: '100%' }}>
            <QRCodeSVG value={qr} size={280} style={{ maxWidth: '100%', height: 'auto' }} />
          </Paper>
          <Textarea readOnly label={t('devices.pairingText')} value={qr} autosize minRows={2} maxRows={4} w="100%" />
          <Code style={{ overflowWrap: 'anywhere' }}>{code}</Code>
          <Text size="sm">{t('devices.expiresHint')}</Text>
          {phase === 'grant' ? (
            <>
              <Checkbox
                checked={confirmed}
                onChange={(event) => setConfirmed(event.currentTarget.checked)}
                label={t('devices.confirmCode')}
              />
              <Button
                loading={busy}
                disabled={!confirmed}
                onClick={() =>
                  perform(async () => {
                    const client = session.current!
                    await client.confirm(code)
                    if (session.current === client) {
                      setQR('')
                      setPhase('linked')
                    }
                  })
                }
              >
                {t('devices.finish')}
              </Button>
            </>
          ) : (
            <Text>{t('devices.waiting')}</Text>
          )}
          <Button variant="light" onClick={lock}>
            {t('devices.lock')}
          </Button>
        </Stack>
      )}
      {phase === 'linked' && (
        <>
          <Group>
            <Button variant="light" onClick={lock}>
              {t('devices.lock')}
            </Button>
            <Button variant="light" loading={busy} onClick={() => perform(refresh)}>
              {t('devices.refresh')}
            </Button>
          </Group>
          {peer ? (
            <>
              <Button
                variant="subtle"
                onClick={() => {
                  setPeer('')
                  setMessages([])
                }}
              >
                {t('devices.chats')}
              </Button>
              <Text size="xs" style={{ overflowWrap: 'anywhere' }}>
                {pubkeyToNpub(peer)}
              </Text>
              <Text size="xs" c="dimmed">
                {t('devices.historyLimit')}
              </Text>
              {messages
                .filter((message) => !message.expiration || message.expiration > Date.now() / 1000)
                .map((message) => (
                  <Paper
                    p="sm"
                    withBorder
                    key={message.id}
                    bg={message.isOutgoing ? 'var(--mantine-color-cyan-light)' : undefined}
                  >
                    <Text size="xs" c="dimmed">
                      {message.isOutgoing ? t('devices.you') : t('devices.contact')} ·{' '}
                      {new Date(message.createdAt * 1000).toLocaleString()} · {message.status}
                    </Text>
                    <Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.content}</Text>
                  </Paper>
                ))}
              <Textarea
                label={t('devices.message')}
                value={draft}
                maxLength={4000}
                onChange={(event) => setDraft(event.currentTarget.value)}
                autosize
                minRows={2}
              />
              <Button
                loading={busy}
                disabled={!draft.trim()}
                onClick={() =>
                  perform(async () => {
                    const client = session.current!
                    await client.request('send', { peer, text: draft })
                    if (session.current === client) {
                      setDraft('')
                      await refresh()
                    }
                  })
                }
              >
                {t('devices.send')}
              </Button>
            </>
          ) : (
            <>
              <Text size="sm">{t('devices.textOnly')}</Text>
              {chats.map((chat) => (
                <Button
                  key={chat.pubkey}
                  variant="default"
                  onClick={() => {
                    setMessages([])
                    setPeer(chat.pubkey)
                  }}
                >
                  {chat.name}
                </Button>
              ))}
              <TextInput
                label={t('devices.newChat')}
                value={newPeer}
                placeholder="npub1…"
                onChange={(event) => setNewPeer(event.currentTarget.value)}
              />
              <Button
                variant="light"
                disabled={!npubToPubkey(newPeer.trim())}
                onClick={() => {
                  setMessages([])
                  setPeer(npubToPubkey(newPeer.trim())!)
                  setNewPeer('')
                }}
              >
                {t('devices.openChat')}
              </Button>
            </>
          )}
        </>
      )}
      {phase === 'removed' && <Alert color="orange">{t('devices.removedExplanation')}</Alert>}
      {phase !== 'setup' && phase !== 'loading' && (
        <Stack mt="xl">
          <Checkbox
            checked={eraseConfirm}
            onChange={(event) => setEraseConfirm(event.currentTarget.checked)}
            label={t('devices.eraseConfirm')}
          />
          <Button
            variant="subtle"
            color="red"
            disabled={!eraseConfirm || busy}
            onClick={() =>
              perform(async () => {
                lock()
                const unlock = await exclusiveDeviceSession('companion')
                try {
                  await deleteLinkedVault()
                  setEraseConfirm(false)
                  setPhase('setup')
                } finally {
                  unlock()
                }
              })
            }
          >
            {t('devices.erase')}
          </Button>
        </Stack>
      )}
    </Stack>
  )
}
