import React from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { Module } from '../types';
// Original vector artwork: no stock photos, external images, or fictitious people.
export function Art({ module, hero = false }: { module?: Module; hero?: boolean }) {
  if (hero) return <Svg width="100%" height="100%" viewBox="0 0 430 300">
    <Circle cx="252" cy="139" r="123" fill="#2D7061" /><Circle cx="252" cy="139" r="90" fill="#397D6D" />
    <Path d="M55 244 Q180 203 396 244 L396 264 L55 264Z" fill="#174B40" />
    <Rect x="170" y="110" width="90" height="129" rx="5" fill="#E3E4C5" /><Path d="M155 112 L215 65 L275 112Z" fill="#F2B891" />
    <Rect x="201" y="187" width="26" height="52" rx="13" fill="#286553" />
    <Rect x="186" y="131" width="20" height="25" rx="3" fill="#3F7C68" /><Rect x="224" y="131" width="20" height="25" rx="3" fill="#3F7C68" />
    <Rect x="271" y="148" width="68" height="91" rx="5" fill="#C7D8C3" /><Path d="M263 150 L305 116 L347 150Z" fill="#94B9A1" /><Rect x="294" y="191" width="21" height="48" rx="10" fill="#286553" />
    <Path d="M106 231V128" stroke="#BDCA9F" strokeWidth="6" /><Ellipse cx="88" cy="149" rx="23" ry="14" rotation="35" origin="88,149" fill="#94B89D" /><Ellipse cx="123" cy="124" rx="24" ry="15" rotation="-35" origin="123,124" fill="#C6D5B0" /><Ellipse cx="88" cy="108" rx="24" ry="16" rotation="35" origin="88,108" fill="#A5C4A4" />
    <Circle cx="153" cy="188" r="13" fill="#F1C3A3" /><Path d="M139 207Q154 195 168 208L178 237H135Z" fill="#E7A777" /><Path d="M145 237V261M163 237V261" stroke="#163D35" strokeWidth="9" strokeLinecap="round" />
    <Circle cx="357" cy="198" r="12" fill="#EAC3A6" /><Path d="M344 216Q357 205 371 216L377 243H338Z" fill="#D9DDBA" /><Path d="M347 243V262M366 243V262" stroke="#173E35" strokeWidth="8" strokeLinecap="round" />
    <G rotation="-13" origin="320,63"><Rect x="287" y="38" width="65" height="50" rx="14" fill="#F8F5E9" /><Path d="M307 55C299 45 290 62 320 76C350 59 331 45 322 55Z" fill="#D49A7B" /></G>
    <Circle cx="69" cy="64" r="5" fill="#E4C79C" /><Path d="M374 108h12m-6-6v12M157 40h12m-6-6v12" stroke="#ACCAAF" strokeWidth="2" />
  </Svg>;
  return <Svg width="100%" height="100%" viewBox="0 0 320 180">
    <Circle cx="250" cy="28" r="70" fill="#FFFFFF" opacity=".23" /><Circle cx="45" cy="165" r="60" fill="#FFFFFF" opacity=".16" />
    <Ellipse cx="165" cy="154" rx="83" ry="8" fill="#153A30" opacity=".09" />
    {module === 'swap' ? <G>
      <G rotation="-12" origin="137,97"><Rect x="92" y="47" width="67" height="100" rx="5" fill="#4C7F68" /><Rect x="98" y="48" width="4" height="98" fill="#336951" /><Rect x="109" y="66" width="35" height="4" rx="2" fill="#E4E7BC" /><Path d="M121 98Q137 77 141 104Q128 117 121 98" fill="#AEC29B" /></G>
      <G rotation="10" origin="181,100"><Rect x="154" y="54" width="65" height="96" rx="5" fill="#D8AA79" /><Rect x="161" y="55" width="3" height="93" fill="#BA8B60" /><Rect x="174" y="73" width="30" height="3" rx="1" fill="#F7E8CB" /><Circle cx="187" cy="107" r="13" fill="#F0D3A0" /></G>
      <Path d="M237 79q23 22-2 43m0-12v13h13M80 114q-22-25 3-42m0 12V71H70" stroke="#55846D" strokeWidth="3" fill="none" strokeLinecap="round" />
    </G> : module === 'help' ? <G>
      <Path d="M105 90L160 47L214 90Z" fill="#C99165" /><Rect x="115" y="87" width="89" height="64" rx="4" fill="#E8BD90" /><Rect x="150" y="115" width="22" height="36" rx="11" fill="#9C7655" />
      <Path d="M98 139C118 122 140 150 165 152C192 141 220 122 236 134C242 146 198 167 169 169C136 165 112 155 98 153Z" fill="#F4D8B8" />
      <Path d="M154 83C142 68 125 89 160 107C194 87 176 69 163 83Z" fill="#B9654F" />
      <Path d="M80 57h13m-6-6v12M231 64h13m-6-6v12" stroke="#BB8A62" strokeWidth="2" />
    </G> : module === 'study' ? <G>
      <Rect x="81" y="141" width="164" height="7" rx="3" fill="#8C80AC" /><Rect x="95" y="148" width="5" height="23" fill="#8C80AC" /><Rect x="229" y="148" width="5" height="23" fill="#8C80AC" />
      <Path d="M124 135V71L165 48" stroke="#6C6389" strokeWidth="6" fill="none" strokeLinecap="round" /><Path d="M150 46Q177 31 190 56L158 77Z" fill="#AA9DC6" />
      <Path d="M167 68L196 139H125Z" fill="#F4E6BC" opacity=".6" /><Rect x="141" y="125" width="60" height="12" rx="2" fill="#D3B78D" /><Rect x="145" y="116" width="54" height="9" rx="2" fill="#9B92B6" />
      <Path d="M218 129V91M218 111Q190 97 210 89Q223 90 218 111M218 104Q245 87 231 81Q217 82 218 104" stroke="#718B76" strokeWidth="3" fill="#9AB39C" /><Path d="M207 123H230L226 141H212Z" fill="#C3A2A3" />
    </G> : <G>
      <Path d="M104 85L160 64L219 86L162 108Z" fill="#C89475" /><Path d="M104 85V140L162 161V108Z" fill="#DEB092" /><Path d="M162 108L219 86V141L162 161Z" fill="#BD896D" /><Path d="M135 73L192 95V151L181 155V99L124 78Z" fill="#EBC7A7" />
      <Path d="M158 44C141 23 117 51 159 76C202 49 178 24 161 44Z" fill="#B9637A" />
      <Path d="M87 64h12m-6-6v12M226 53h12m-6-6v12" stroke="#C48D9A" strokeWidth="2" />
    </G>}
  </Svg>;
}
