# Contexto — Estrutura de Reservas Aéreas  
**Companhias:** LATAM, GOL, AZUL

## Visão Geral

Uma **reserva aérea (PNR)** pode conter **um ou mais itinerários**, e cada itinerário é composto por **um ou mais segmentos de voo**.  
Este modelo se aplica às companhias **LATAM**, **GOL** e **AZUL**, que seguem a mesma lógica estrutural em seus sistemas.

---

## Definições

- **Reserva (PNR):** Conjunto completo da viagem.
- **Itinerário:** Cada perna da viagem (ida, volta ou trecho independente).
- **Segmento:** Um voo individual.  
  > Regra: **1 número de voo = 1 segmento**

---

## Tipos de Reserva

### Somente Ida (One-way)
- Contém **1 itinerário**
- Pode ser:
  - Direto (1 segmento)
  - Com conexão(ões) (2 ou mais segmentos)

---

### Ida e Volta (Round-trip)
- Contém **2 itinerários**:
  - Itinerário de ida
  - Itinerário de volta
- Cada itinerário pode ter estrutura diferente:
  - Direto ou com múltiplos segmentos

---

### Multi-city / Multitrecho
- Contém **3 ou mais itinerários independentes**
- Cada itinerário é definido explicitamente pelo passageiro

Exemplo:
```
CGB → GRU
GRU → REC
REC → CGB
```

---

### Open Jaw
- Ida e volta com cidades diferentes na origem ou no destino

**Open jaw de destino**
```
CGB → GRU
GIG → CGB
```

**Open jaw de origem**
```
CGB → GRU
GRU → VCP
```

---

## Estrutura dos Voos

### Voo Direto
- 1 itinerário
- 1 segmento

```
CGB → GRU
```

---

### Voo com Conexão
- 1 itinerário
- 2 ou mais segmentos

```
CGB → BSB → GRU
```

---

### Múltiplas Conexões
- Mais de 2 segmentos no mesmo itinerário

```
CGB → BSB → CNF → GRU
```

---

## Combinações Comuns

- Ida direta + volta com conexão
- Ida com conexão + volta direta
- Ida e volta com múltiplos segmentos

> **Importante:** Não existe garantia de simetria entre ida e volta.

---

## Casos Especiais

- **Conexão longa / pernoite:**  
  Conexões com duração elevada podem ocorrer dentro do mesmo itinerário.

- **Stopover:**  
  Parada planejada (>24h), quando permitido pela tarifa.

- **Codeshare / Interline:**  
  Segmentos operados por companhias diferentes no mesmo bilhete.

---

## Regras Importantes para Processamento

- Um **itinerário pode conter múltiplos segmentos**.
- Uma **reserva pode conter múltiplos itinerários**.
- Ida e volta **não implicam estruturas iguais**.
- LATAM, GOL e AZUL seguem esse mesmo modelo lógico.

---

## Regra de Ouro (Modelagem)

```
Reserva (PNR)
 ├── Itinerário(s)
 │     ├── Segmento(s)
```

---

## Observação para Sistemas e IA

Ao processar reservas aéreas:
- Nunca assumir apenas um voo por itinerário
- Sempre validar múltiplos segmentos
- Considerar multi-city e open jaw como estruturas válidas
- Tratar ida e volta como itinerários independentes
