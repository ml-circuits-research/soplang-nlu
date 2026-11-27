// A circuit as SOP Lang text: one wire per line.
export function emit(wires) {
  return wires.map(wire => '@' + wire.id + ' ' + wire.type + wire.slots.map(([key, value]) => ' ' + key + '=' + value).join('')).join('\n')
}
