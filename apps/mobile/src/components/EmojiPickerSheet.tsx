import { useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { tokens } from '../theme';

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Smileys', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️'] },
  { label: 'Gestures', emojis: ['👍','👎','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👋','🤚','🖐️','✋','🖖','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦵','🦿','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄','💋','💘','💝','💖','💗','💓','💞','💕','💟','❣️','💔','❤️','🧡','💛','💚','💙','💜','🤎','🖤','🤍','💯','💢','💥','💫','💦','💨','🕳️','💣','💬','🗨️','🗯️','💭','💤'] },
  { label: 'Animals', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷️','🕸️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🐈','🐓','🦃','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦦','🦥','🐁','🐀','🐿️','🦔'] },
  { label: 'Food', emojis: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🥪','🥙','🧆','🌮','🌯','🥗','🥘','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','☕','🍵','🧃','🥤','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🧊'] },
  { label: 'Activities', emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️','🤺','🤾','🏌️','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪','🤹','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🎰','🧩'] },
  { label: 'Objects', emojis: ['⌚','📱','💻','⌨️','🖥️','🖨️','🖱️','💽','💾','💿','📀','📷','📸','📹','🎥','📽️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯️','🛢️','💸','💵','💴','💶','💷','🪙','💰','💳','💎','⚖️','🧰','🔧','🔨','⚒️','🛠️','⛏️','🔩','⚙️','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🛡️','🚬','⚰️','⚱️','🏺','🔮','📿','🧿','💈','⚗️','🔭','🔬','🩹','🩺','💊','💉','🩸','🧬','🦠','🧪','🌡️','🧹','🧺','🧻','🚽','🚿','🛁','🛀','🧼','🪒','🧽','🛎️','🔑','🗝️','🚪','🛋️','🛏️','🧸','🖼️','🛍️','🛒','🎁','🎈','🎀','🎉','🎊','🎎','🏮','🎐','🧧','✉️','📩','📨','📧','💌','📦','📜','📄','📊','📈','📉','📅','📆','📇','📋','📁','📂','📌','📍','✂️','🖊️','🖋️','✒️','📝','✏️','🔍','🔎','🔐','🔒','🔓'] },
  { label: 'Symbols', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','☯️','☦️','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','⚛️','☢️','☣️','✴️','💮','㊙️','㊗️','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','💹','❇️','✳️','❎','🌐','💠','🌀','💤','♿','🅿️','🚹','🚺','🚼','🚻','🎦','📶','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','▶️','⏸️','⏹️','⏭️','⏮️','⏩','⏪','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','🔀','🔁','🔂','🔄','🎵','🎶','➕','➖','➗','✖️','♾️','💲','™️','©️','®️','✔️','☑️','🔘','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔸','🔹','🔶','🔷','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','⬛','⬜','🔈','🔇','🔉','🔊','🔔','🔕','📣','📢','💬','💭','🗯️','♠️','♣️','♥️','♦️','🃏','🎴','🀄'] },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
};

export function EmojiPickerSheet({ visible, onClose, onPick }: Props) {
  const [tab, setTab] = useState(0);
  const group = EMOJI_GROUPS[tab]!;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={{ paddingHorizontal: 8 }}>
            {EMOJI_GROUPS.map((g, i) => (
              <Pressable
                key={g.label}
                onPress={() => setTab(i)}
                style={[styles.tab, i === tab && styles.tabActive]}
              >
                <Text style={[styles.tabText, i === tab && styles.tabTextActive]}>{g.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView style={styles.grid} contentContainerStyle={styles.gridContent}>
            <View style={styles.gridInner}>
              {group.emojis.map((e, i) => (
                <Pressable
                  key={`${tab}-${i}`}
                  onPress={() => { onPick(e); }}
                  style={styles.cell}
                  android_ripple={{ color: tokens.color.bubbleOther, borderless: false }}
                >
                  <Text style={styles.emoji}>{e}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: tokens.color.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, height: '52%', overflow: 'hidden' },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: tokens.color.border, marginTop: 8, marginBottom: 8 },
  tabs: { flexGrow: 0, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: tokens.color.border },
  tab: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: tokens.color.brand },
  tabText: { fontSize: 11, fontWeight: '600', color: tokens.color.textSecondary, letterSpacing: 0.4 },
  tabTextActive: { color: tokens.color.brand },
  grid: { flex: 1 },
  gridContent: { padding: 6 },
  gridInner: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '12.5%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 26 },
});
