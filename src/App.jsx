import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Scatter } from 'recharts';

// Componentes UI de shadcn/ui (implementación simplificada para este ejemplo)
const Input = ({ type = 'text', value, onChange, placeholder, className = '' }) => (
  <input
    type={type}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
  />
);

const Button = ({ onClick, children, className = '' }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 ${className}`}
  >
    {children}
  </button>
);

const Card = ({ children, className = '' }) => (
  <div className={`rounded-xl border bg-card text-card-foreground shadow ${className}`}>
    {children}
  </div>
);

const CardHeader = ({ children, className = '' }) => (
  <div className={`flex flex-col space-y-1.5 p-6 ${className}`}>
    {children}
  </div>
);

const CardTitle = ({ children, className = '' }) => (
  <h3 className={`font-semibold leading-none tracking-tight ${className}`}>
    {children}
  </h3>
);

const CardContent = ({ children, className = '' }) => (
  <div className={`p-6 pt-0 ${className}`}>
    {children}
  </div>
);

const Label = ({ children, htmlFor, className = '' }) => (
  <label htmlFor={htmlFor} className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}>
    {children}
  </label>
);

/**
 * Función para parsear una ecuación lineal de la forma Q = aP + b o Q = b + aP.
 * Asume que 'P' es la variable de precio.
 * @param {string} eq La cadena de la ecuación (ej. "100 - 2P", "50 + P").
 * @returns {{ slope: number, intercept: number, error: string | null }} Objeto con la pendiente, el intercepto y cualquier error.
 */
const parseEquation = (eq) => {
  eq = eq.replace(/\s/g, '').toLowerCase(); // Eliminar espacios y convertir a minúsculas
  let slope = 0;
  let intercept = 0;
  let error = null;

  try {
    // Reemplazar 'p' con '1p' si está al inicio o después de un operador
    eq = eq.replace(/^p/, '1p').replace(/([+-])p/, '$11p');
    // Manejar '-p' al inicio
    eq = eq.replace(/^-p/, '-1p');

    // Dividir en términos basados en '+' o '-' (manteniendo el signo con el término)
    const terms = eq.match(/([+-]?\d*\.?\d+p?)/g);

    if (!terms) {
      error = "Formato de ecuación inválido. Usa 'aP + b' o 'b - aP'.";
      return { slope: 0, intercept: 0, error };
    }

    for (const term of terms) {
      if (term.includes('p')) {
        const coefStr = term.replace('p', '');
        if (coefStr === '+' || coefStr === '') { // Maneja 'p' o '+p'
          slope += 1;
        } else if (coefStr === '-') { // Maneja '-p'
          slope -= 1;
        } else {
          slope += parseFloat(coefStr);
        }
      } else {
        intercept += parseFloat(term);
      }
    }

    if (isNaN(slope) || isNaN(intercept)) {
      error = "Por favor, ingresa un formato de ecuación válido (ej. '2P + 10' o '50 - 3P').";
    }

  } catch (e) {
    error = "Error al parsear la ecuación. Asegúrate de usar el formato correcto.";
  }

  return { slope, intercept, error };
};

// Componente de punto personalizado para el equilibrio
const CustomEquilibriumDot = (props) => {
  const { cx, cy, payload } = props;
  
  // Solo renderizar el punto si el payload tiene la propiedad isEquilibriumPoint
  if (payload.isEquilibriumPoint) {
    const label = payload.label;
    const color = payload.dotColor || '#000'; // Color del punto
    const textColor = payload.textColor || '#333'; // Color del texto
    const r = payload.dotRadius || 4; // Radio del punto

    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill={color} stroke="white" strokeWidth={1.5} />
        <text x={cx + 8} y={cy - 8} fill={textColor} fontSize={12} fontWeight="bold">
          {label}
        </text>
      </g>
    );
  }
  return null;
};


// Main App Component
const App = () => {
  // Ecuaciones de ejemplo de la imagen: Qdx = -px + 16, Qox = px + 4
  const [demandEq, setDemandEq] = useState('-P + 16'); 
  const [supplyEq, setSupplyEq] = useState('P + 4'); 
  const [demandShift, setDemandShift] = useState(0); // Nuevo estado para el desplazamiento de la demanda
  const [supplyShift, setSupplyShift] = useState(0); // Nuevo estado para el desplazamiento de la oferta

  const [initialEquilibrium, setInitialEquilibrium] = useState(null);
  const [shiftedEquilibrium, setShiftedEquilibrium] = useState(null);
  const [graphData, setGraphData] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [showTable, setShowTable] = useState(false);
  const [error, setError] = useState('');
  const [explanation, setExplanation] = useState('');
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [equilibriumDots, setEquilibriumDots] = useState([]); // Nuevo estado para los puntos de equilibrio de la gráfica

  // Pequeña tolerancia para comparar números flotantes
  const EPSILON = 0.01; // Ajusta este valor si necesitas más o menos precisión

  // Función para calcular el equilibrio (original y desplazado)
  const calculateEquilibrium = useCallback(() => {
    // 1. Resetear estados relacionados con el cálculo y la visualización
    // Solo resetear si no son null para evitar re-renders innecesarios si ya están en el estado deseado
    if (error !== '') setError('');
    if (explanation !== '') setExplanation('');
    if (showTable) setShowTable(false); // Ocultar tabla al recalcular

    // 2. Definir shift variables al inicio de la función
    const currentDemandShift = parseFloat(demandShift || 0);
    const currentSupplyShift = parseFloat(supplyShift || 0);

    // 3. Parsear ecuaciones
    const parsedDemand = parseEquation(demandEq);
    const parsedSupply = parseEquation(supplyEq);

    // Variables locales para los resultados del parseo y equilibrio
    let localError = '';
    let localPEInitial = null;
    let localQEInitial = null;
    let localPEShifted = null;
    let localQEShifted = null;

    // Declarar bD_shifted y bS_shifted aquí para que estén disponibles globalmente en la función
    let bD_shifted = parsedDemand.intercept + currentDemandShift;
    let bS_shifted = parsedSupply.intercept + currentSupplyShift;


    if (parsedDemand.error) {
      localError = `Error en la ecuación de Demanda: ${parsedDemand.error}`;
    } else if (parsedSupply.error) {
      localError = `Error en la ecuación de Oferta: ${parsedSupply.error}`;
    } else {
      const aD = parsedDemand.slope; // pendiente de Q = aP + b para Demanda
      const bD = parsedDemand.intercept; // intercepto de Q = aP + b para Demanda
      const aS = parsedSupply.slope; // pendiente de Q = aP + b para Oferta
      const bS = parsedSupply.intercept; // intercepto de Q = aP + b para Oferta

      // --- Cálculo del Equilibrio Original ---
      if (aS - aD !== 0) {
        const p_calc = (bD - bS) / (aS - aD);
        const q_calc = aD * p_calc + bD;

        if (!isNaN(p_calc) && !isNaN(q_calc) && q_calc >= 0 && p_calc >= 0) {
          localPEInitial = p_calc;
          localQEInitial = q_calc;
        }
      } else {
        localError = "Las pendientes de oferta y demanda son las mismas, no hay un único punto de equilibrio o son paralelas.";
      }

      // --- Cálculo del Equilibrio Desplazado ---
      if (aS - aD !== 0) {
        const p_shifted_calc = (bD_shifted - bS_shifted) / (aS - aD);
        const q_shifted_calc = aD * p_shifted_calc + bD_shifted;

        if (!isNaN(p_shifted_calc) && !isNaN(q_shifted_calc) && q_shifted_calc >= 0 && p_shifted_calc >= 0) {
          localPEShifted = p_shifted_calc;
          localQEShifted = q_shifted_calc;
        }
      }
    }

    // Actualizar estados de equilibrio solo si los valores han cambiado
    const newInitialEquilibrium = localPEInitial !== null ? { price: localPEInitial.toFixed(2), quantity: localQEInitial.toFixed(2) } : null;
    const newShiftedEquilibrium = localPEShifted !== null ? { price: localPEShifted.toFixed(2), quantity: localQEShifted.toFixed(2) } : null;

    // Comparar contenido de objetos para evitar re-renders innecesarios
    if (JSON.stringify(newInitialEquilibrium) !== JSON.stringify(initialEquilibrium)) {
      setInitialEquilibrium(newInitialEquilibrium);
    }
    if (JSON.stringify(newShiftedEquilibrium) !== JSON.stringify(shiftedEquilibrium)) {
      setShiftedEquilibrium(newShiftedEquilibrium);
    }

    // Determinar el error final
    if (localError === '' && !newInitialEquilibrium && !newShiftedEquilibrium && (currentDemandShift !== 0 || currentSupplyShift !== 0)) {
        localError = "No se pudo encontrar un equilibrio válido para las ecuaciones dadas, incluso con los desplazamientos.";
    }
    if (localError !== error) {
        setError(localError);
    }

    // --- Generar datos para la gráfica y la tabla (Cantidad en X, Precio en Y) ---
    let maxQuantityValue = 0;
    let minQuantityValue = 0; // La cantidad siempre empieza en 0

    // Considerar las cantidades de equilibrio para el rango máximo
    if (localQEInitial !== null) maxQuantityValue = Math.max(maxQuantityValue, localQEInitial * 1.5);
    if (localQEShifted !== null) maxQuantityValue = Math.max(maxQuantityValue, localQEShifted * 1.5);

    // Considerar los interceptos de cantidad (Q cuando P=0)
    // Para demanda (Qd = aD*P + bD), si aD < 0 (pendiente negativa), Qd cuando P=0 es bD
    if (parsedDemand.slope < 0 && parsedDemand.intercept > 0) maxQuantityValue = Math.max(maxQuantityValue, parsedDemand.intercept * 1.1);
    // Para oferta (Qs = aS*P + bS), si aS > 0 (pendiente positiva), Qs cuando P=0 es bS
    if (parsedSupply.slope > 0 && parsedSupply.intercept > 0) maxQuantityValue = Math.max(maxQuantityValue, parsedSupply.intercept * 1.1);
    // Considerar los interceptos de cantidad para las curvas desplazadas
    if (parsedDemand.slope < 0 && (parsedDemand.intercept + currentDemandShift) > 0) maxQuantityValue = Math.max(maxQuantityValue, (parsedDemand.intercept + currentDemandShift) * 1.1);
    if (parsedSupply.slope > 0 && (parsedSupply.intercept + currentSupplyShift) > 0) maxQuantityValue = Math.max(maxQuantityValue, (parsedSupply.intercept + currentSupplyShift) * 1.1);

    // Asegurar un rango mínimo de cantidad, pero más ajustado que 100
    maxQuantityValue = Math.max(maxQuantityValue, 20); // Valor mínimo más razonable

    const numPointsGraph = 50; // Puntos para una curva suave en la gráfica
    const stepGraph = (maxQuantityValue - minQuantityValue) / numPointsGraph;

    const graphDataPoints = [];
    let rawTableQuantities = new Set(); // Usar un Set para almacenar cantidades únicas para la tabla

    for (let i = 0; i <= numPointsGraph; i++) {
        const q = minQuantityValue + i * stepGraph;

        const p_demand_original = (parsedDemand.slope !== 0 && (q - parsedDemand.intercept) / parsedDemand.slope >= 0) ? (q - parsedDemand.intercept) / parsedDemand.slope : null;
        const p_supply_original = (parsedSupply.slope !== 0 && (q - parsedSupply.intercept) / parsedSupply.slope >= 0) ? (q - parsedSupply.intercept) / parsedSupply.slope : null;
        const p_demand_shifted = (parsedDemand.slope !== 0 && (q - bD_shifted) / parsedDemand.slope >= 0) ? (q - bD_shifted) / parsedDemand.slope : null;
        const p_supply_shifted = (parsedSupply.slope !== 0 && (q - bS_shifted) / parsedSupply.slope >= 0) ? (q - bS_shifted) / parsedSupply.slope : null;

        graphDataPoints.push({
            quantity: q,
            price_demanda_original: p_demand_original,
            price_oferta_original: p_supply_original,
            price_demanda_shifted: p_demand_shifted,
            price_oferta_shifted: p_supply_shifted,
        });

        // Añadir cantidades para la tabla con un paso más amigable o si son números enteros/redondos
        // Añadir solo enteros o números con pocos decimales que sean "redondos"
        if (q % 5 === 0 || Math.abs(q - Math.round(q)) < EPSILON * 10) {
             rawTableQuantities.add(Math.round(q)); // Redondear a entero para estas cantidades
        }
    }

    // Asegurarse de que las cantidades de equilibrio estén en la tabla con su precisión original
    if (localQEInitial !== null) rawTableQuantities.add(localQEInitial);
    if (localQEShifted !== null) rawTableQuantities.add(localQEShifted);

    // Convertir el Set a un array y ordenar
    const sortedTableQuantities = Array.from(rawTableQuantities).sort((a, b) => a - b);

    const tableDataPoints = sortedTableQuantities.map(q => {
        // Recalcular precios para las cantidades exactas de la tabla
        const p_demand_original = (parsedDemand.slope !== 0 && (q - parsedDemand.intercept) / parsedDemand.slope >= 0) ? (q - parsedDemand.intercept) / parsedDemand.slope : null;
        const p_supply_original = (parsedSupply.slope !== 0 && (q - parsedSupply.intercept) / parsedSupply.slope >= 0) ? (q - parsedSupply.intercept) / parsedSupply.slope : null;
        const p_demand_shifted = (parsedDemand.slope !== 0 && (q - bD_shifted) / parsedDemand.slope >= 0) ? (q - bD_shifted) / parsedDemand.slope : null;
        const p_supply_shifted = (parsedSupply.slope !== 0 && (q - bS_shifted) / parsedSupply.slope >= 0) ? (q - bS_shifted) / parsedSupply.slope : null;

        // Determinar el formato de visualización para la cantidad en la tabla
        let displayQuantity;
        const isInitialEq = localQEInitial !== null && Math.abs(q - localQEInitial) < EPSILON;
        const isShiftedEq = localQEShifted !== null && Math.abs(q - localQEShifted) < EPSILON;

        if (isInitialEq || isShiftedEq) {
            displayQuantity = q.toFixed(2); // Mostrar cantidades de equilibrio con 2 decimales
        } else {
            displayQuantity = q.toFixed(0); // Mostrar otras cantidades como enteros
        }

        return {
            quantity: displayQuantity,
            price_demanda_original: p_demand_original !== null ? p_demand_original.toFixed(2) : 'N/A',
            price_oferta_original: p_supply_original !== null ? p_supply_original.toFixed(2) : 'N/A',
            price_demanda_shifted: p_demand_shifted !== null ? p_demand_shifted.toFixed(2) : 'N/A',
            price_oferta_shifted: p_supply_shifted !== null ? p_supply_shifted.toFixed(2) : 'N/A',
        };
    });


    // --- Preparar datos para los puntos de equilibrio de la gráfica (Scatter) ---
    const localEquilibriumDots = [];
    if (localPEInitial !== null && localQEInitial !== null) {
        localEquilibriumDots.push({
            quantity: localQEInitial,
            price: localPEInitial, 
            isEquilibriumPoint: true,
            label: "E0",
            dotColor: "#63C2FF", // Color para E0 (Demanda Original)
            textColor: "#333",
            dotRadius: 5
        });
    }

    if (localPEShifted !== null && localQEShifted !== null && (currentDemandShift !== 0 || currentSupplyShift !== 0)) {
        localEquilibriumDots.push({
            quantity: localQEShifted,
            price: localPEShifted, 
            isEquilibriumPoint: true,
            label: "E1",
            dotColor: "#8681BD", // Color para E1 (Demanda Nueva)
            textColor: "#333",
            dotRadius: 5
        });
    }
    setEquilibriumDots(localEquilibriumDots); 


    setGraphData(graphDataPoints);
    setTableData(tableDataPoints);

  }, [demandEq, supplyEq, demandShift, supplyShift]); // Dependencias para useCallback


  // Función para generar la explicación usando la API de Gemini
  const generateExplanation = useCallback(async () => {
    // Solo generar explicación si hay al menos un equilibrio válido o si hay un error para explicar
    if ((!initialEquilibrium && !shiftedEquilibrium && !error) || loadingExplanation) {
        setExplanation(''); // Limpiar si no hay nada que explicar o ya está cargando
        return;
    }

    setLoadingExplanation(true);
    setExplanation(''); // Limpiar explicación previa

    let prompt = `
        Estamos analizando un mercado con las siguientes ecuaciones de oferta y demanda:
        - Ecuación de Demanda (Qd): ${demandEq}
        - Ecuación de Oferta (Qs): ${supplyEq}
    `;

    if (initialEquilibrium) {
        prompt += `
        El punto de equilibrio inicial es:
        - Precio de Equilibrio (P_E inicial): ${initialEquilibrium.price}
        - Cantidad de Equilibrio (Q_E inicial): ${initialEquilibrium.quantity}
        `;
    }

    if (demandShift !== 0 || supplyShift !== 0) {
        prompt += `
        Se han aplicado los siguientes desplazamientos:
        - Desplazamiento de la Demanda: ${demandShift}
        - Desplazamiento de la Oferta: ${supplyShift}
        `;
        if (shiftedEquilibrium) {
            prompt += `
            El nuevo punto de equilibrio después de los desplazamientos es:
            - Nuevo Precio de Equilibrio (P_E nuevo): ${shiftedEquilibrium.price}
            - Nueva Cantidad de Equilibrio (Q_E nueva): ${shiftedEquilibrium.quantity}
            `;
        } else {
             prompt += `
            No se encontró un nuevo punto de equilibrio válido después de los desplazamientos.
            `;
        }
    }
    
    if (error) {
        prompt += `
        Además, se ha detectado el siguiente error en el cálculo: ${error}. Por favor, explica qué podría significar este error en el contexto económico (por ejemplo, si las curvas son paralelas o si el equilibrio es negativo).
        `;
    }


    prompt += `
        Por favor, proporciona una explicación detallada de lo que significan estos resultados en el contexto de la economía.
        Incluye los siguientes puntos:
        1.  Una breve descripción de qué representa la curva de demanda y cómo se relaciona con el comportamiento del consumidor.
        2.  Una breve descripción de qué representa la curva de oferta y cómo se relaciona con el comportamiento del productor.
        3.  Explica por qué el punto de equilibrio es crucial para el mercado.
        4.  Describe qué sucedería si el precio estuviera por encima del precio de equilibrio (exceso de oferta o excedente) y cómo el mercado tiende a corregirse.
        5.  Describe qué sucedería si el precio estuviera por debajo del precio de equilibrio (exceso de demanda o escasez) y cómo el mercado tiende a corregirse.
        6.  **Si se aplicaron desplazamientos, explica cómo estos desplazamientos afectaron las curvas y el punto de equilibrio (precio y cantidad).**

        Mantén la explicación concisa, clara, y didáctica, ideal para alguien que está aprendiendo conceptos básicos de economía.
    `;

    try {
        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        };
        const apiKey = ""; // Canvas proporcionará esta clave automáticamente
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            const text = result.candidates[0].content.parts[0].text;
            setExplanation(text);
        } else {
            setExplanation("No se pudo generar una explicación. Inténtalo de nuevo.");
            console.error("Unexpected API response structure:", result);
        }
    } catch (e) {
        setExplanation("Error al conectar con la API de Gemini. Asegúrate de tener conexión a internet.");
        console.error("Error al llamar a la API de Gemini:", e);
    } finally {
        setLoadingExplanation(false);
    }
  }, [demandEq, supplyEq, initialEquilibrium, shiftedEquilibrium, demandShift, supplyShift, error, loadingExplanation]); // Añadido loadingExplanation a las dependencias para evitar llamadas múltiples


  // El useEffect solo se dispara cuando calculateEquilibrium cambia (lo cual solo ocurre si sus dependencias cambian)
  useEffect(() => {
    calculateEquilibrium();
  }, [calculateEquilibrium]);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans antialiased">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Panel de Entradas */}
        <Card className="flex flex-col">
          <CardHeader>
            <h3 className="text-base text-center text-gray-600 font-normal">Aplicaciones de la ciencia económica, UPIICSA</h3> {/* Título de la materia más discreto */}
            <CardTitle className="text-xl text-center text-gray-800">
              Calculadora de Oferta y Demanda
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 flex-grow flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <Label htmlFor="demand-eq" className="text-gray-700">Ecuación de Demanda (ej. -P + 16):</Label>
                <Input
                  id="demand-eq"
                  type="text"
                  value={demandEq}
                  onChange={(e) => setDemandEq(e.target.value)}
                  placeholder="ej. -P + 16"
                />
              </div>
              <div>
                <Label htmlFor="supply-eq" className="text-gray-700">Ecuación de Oferta (ej. P + 4):</Label>
                <Input
                  id="supply-eq"
                  type="text"
                  value={supplyEq}
                  onChange={(e) => setSupplyEq(e.target.value)}
                  placeholder="ej. P + 4"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="demand-shift" className="text-gray-700">Desplazamiento Demanda (+/-):</Label>
                  <Input
                    id="demand-shift"
                    type="number"
                    value={demandShift}
                    onChange={(e) => setDemandShift(parseFloat(e.target.value))}
                    placeholder="ej. +10 o -5"
                  />
                </div>
                <div>
                  <Label htmlFor="supply-shift" className="text-gray-700">Desplazamiento Oferta (+/-):</Label>
                  <Input
                    id="supply-shift"
                    type="number"
                    value={supplyShift}
                    onChange={(e) => setSupplyShift(parseFloat(e.target.value))}
                    placeholder="ej. +15 o -3"
                  />
                </div>
              </div>
              {/* Botón eliminado: <Button onClick={calculateEquilibrium} ... /> */}
            </div>
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                <strong className="font-bold">¡Error!</strong>
                <span className="block sm:inline"> {error}</span>
              </div>
            )}
            {(initialEquilibrium || shiftedEquilibrium || error) && ( // Mostrar esta sección si hay equilibrios o error
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md text-green-800 shadow-sm">
                <h4 className="font-bold text-lg mb-2">Resultados del Equilibrio:</h4>
                {initialEquilibrium ? (
                    <>
                        <p><strong>Precio de Equilibrio:</strong> {initialEquilibrium.price}</p>
                        <p><strong>Cantidad de Equilibrio:</strong> {initialEquilibrium.quantity}</p>
                    </>
                ) : (
                    <p>No se encontró un equilibrio original válido.</p>
                )}
                {shiftedEquilibrium && (demandShift !== 0 || supplyShift !== 0) ? (
                    <>
                        <h5 className="font-bold text-md mt-3 mb-1">Después de Desplazamientos:</h5>
                        <p><strong>Nuevo Precio de Equilibrio:</strong> {shiftedEquilibrium.price}</p>
                        <p><strong>Nueva Cantidad de Equilibrio:</strong> {shiftedEquilibrium.quantity}</p>
                    </>
                ) : (demandShift !== 0 || supplyShift !== 0) && (
                    <p className="mt-3">No se encontró un nuevo equilibrio válido después de los desplazamientos.</p>
                )}
                <Button
                  onClick={generateExplanation}
                  disabled={(!initialEquilibrium && !shiftedEquilibrium && !error) || loadingExplanation} // Deshabilitar si no hay equilibrio ni error para explicar
                  className="w-full mt-4 bg-purple-500 hover:bg-purple-600 text-white rounded-md shadow-md"
                >
                  {loadingExplanation ? 'Generando Explicación...' : 'Explicar Equilibrio ✨'}
                </Button>
                 <Button
                  onClick={() => setShowTable(!showTable)}
                  className="w-full mt-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md shadow-md"
                >
                  {showTable ? 'Ocultar Tabla de Desarrollo' : 'Mostrar Tabla de Desarrollo'}
                </Button>
              </div>
            )}
            {loadingExplanation && (
                <div className="mt-4 p-4 text-center text-gray-600">
                    Cargando explicación...
                </div>
            )}
            {explanation && !loadingExplanation && (
                <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-md text-purple-800 shadow-sm">
                    <h4 className="font-bold text-lg mb-2">Explicación del Equilibrio:</h4>
                    <p className="whitespace-pre-wrap">{explanation}</p>
                </div>
            )}
             {showTable && tableData.length > 0 && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md text-blue-800 shadow-sm overflow-x-auto"> {/* Reintroducido overflow-x-auto */}
                <h4 className="font-bold text-lg mb-2 text-center">Tabla de Desarrollo (Cantidades vs. Precios)</h4>
                <table className="min-w-full divide-y divide-blue-200">
                  <thead className="bg-blue-100">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-blue-700 uppercase tracking-wider rounded-tl-md">
                        Cantidad (Q)
                      </th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-blue-700 uppercase tracking-wider">
                        Precio Demanda Original
                      </th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-blue-700 uppercase tracking-wider">
                        Precio Oferta Original
                      </th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-blue-700 uppercase tracking-wider">
                        Precio Demanda Nueva
                      </th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-blue-700 uppercase tracking-wider rounded-tr-md">
                        Precio Oferta Nueva
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {tableData.map((row, index) => {
                      // Convertir a número para la comparación
                      const rowQuantity = parseFloat(row.quantity);
                      const initialEqQuantity = initialEquilibrium ? parseFloat(initialEquilibrium.quantity) : null;
                      const shiftedEqQuantity = shiftedEquilibrium ? parseFloat(shiftedEquilibrium.quantity) : null;

                      // Priorizar el resaltado naranja para el equilibrio desplazado
                      let rowClassName = '';
                      if (shiftedEqQuantity !== null && (demandShift !== 0 || supplyShift !== 0) && Math.abs(rowQuantity - shiftedEqQuantity) < EPSILON) {
                        rowClassName = 'bg-orange-100 font-bold';
                      } else if (initialEqQuantity !== null && Math.abs(rowQuantity - initialEqQuantity) < EPSILON) {
                        rowClassName = 'bg-yellow-100 font-bold';
                      }

                      return (
                        <tr key={index} className={rowClassName}>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{row.quantity}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{row.price_demanda_original}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{row.price_oferta_original}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{row.price_demanda_shifted}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{row.price_oferta_shifted}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                 <p className="mt-2 text-xs text-gray-600 text-center">
                    La fila resaltada en amarillo indica el equilibrio original. La fila en naranja indica el nuevo equilibrio.
                 </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Panel de Gráfica */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-xl text-center text-gray-800">
              Gráfica de Oferta y Demanda
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col items-center justify-center">
            {graphData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart
                  data={graphData}
                  margin={{
                    top: 10,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="quantity" // Eje X ahora es Cantidad
                    label={{ value: 'Cantidad (Q)', position: 'insideBottomRight', offset: 0 }}
                    type="number"
                    domain={[0, 'auto']}
                    allowDataOverflow={true}
                  />
                  <YAxis
                    label={{ value: 'Precio (P)', angle: -90, position: 'insideLeft' }}
                    type="number"
                    domain={[0, 'auto']}
                    allowDataOverflow={true}
                  />
                  <Tooltip formatter={(value, name, props) => {
                      // Formatear el tooltip para mostrar el nombre correcto del eje
                      if (props.payload && props.payload.isEquilibriumPoint) {
                          // Para los puntos de equilibrio, el valor es el precio y la cantidad es el dataKey del Scatter
                          return [`P: ${value.toFixed(2)}`, `Q: ${props.payload.quantity.toFixed(2)}`, props.payload.label];
                      }
                      // Asegurarse de que el valor no sea null antes de toFixed
                      return [`Precio: ${value !== null ? value.toFixed(2) : 'N/A'}`, name];
                  }} />
                  <Legend />
                  <Line type="monotone" dataKey="price_demanda_original" stroke="#63C2FF" name="Demanda Original" dot={false} /> {/* Color Demanda Original */}
                  <Line type="monotone" dataKey="price_oferta_original" stroke="#D52331" name="Oferta Original" dot={false} /> {/* Color Oferta Original */}
                  {(demandShift !== 0 || supplyShift !== 0) && (
                    <>
                      <Line type="monotone" dataKey="price_demanda_shifted" stroke="#8681BD" strokeDasharray="5 5" name="Demanda Nueva" dot={false} /> {/* Color Demanda Desplazada */}
                      <Line type="monotone" dataKey="price_oferta_shifted" stroke="#FF4F29" strokeDasharray="5 5" name="Oferta Nueva" dot={false} /> {/* Color Oferta Desplazada */}
                    </>
                  )}
                  {/* Scatter para los puntos de equilibrio */}
                  {equilibriumDots.length > 0 && (
                    <Scatter
                      data={equilibriumDots}
                      x="quantity" // Mapear 'quantity' a la posición X
                      y="price"    // Mapear 'price' a la posición Y
                      name="Puntos de Equilibrio" // Nombre para la leyenda
                      shape={<CustomEquilibriumDot />} // Usar el componente de punto personalizado
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-gray-500 text-center">
                Ingresa tus ecuaciones para ver la gráfica aquí.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default App;