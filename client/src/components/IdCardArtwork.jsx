import changeIdCard from '../assets/images/items/changeidcard.png';

export default function IdCardArtwork({ className = 'h-24 w-24' }) {
  return <img src={changeIdCard} alt="Thẻ đổi ID" className={`${className} object-contain`} draggable={false} />;
}
