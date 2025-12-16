/**
 * Gera links de navegação para Waze e Google Maps
 */
export function gerarLinksNavegacao(endereco: string) {
  const encoded = encodeURIComponent(endereco);
  return {
    waze: `https://waze.com/ul?q=${encoded}&navigate=yes`,
    googleMaps: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    appleMaps: `http://maps.apple.com/?q=${encoded}`
  };
}

/**
 * Formata mensagem com endereço e links de navegação
 */
export function formatarMensagemComEndereco(
  titulo: string, 
  hora: string | null, 
  endereco: string | null
): string {
  let msg = titulo;
  
  if (hora) {
    msg += ` (${hora})`;
  }
  
  if (endereco) {
    const links = gerarLinksNavegacao(endereco);
    msg += `\n📍 ${endereco}`;
    msg += `\n🗺️ Waze: ${links.waze}`;
    msg += `\n🗺️ Maps: ${links.googleMaps}`;
  }
  
  return msg;
}
