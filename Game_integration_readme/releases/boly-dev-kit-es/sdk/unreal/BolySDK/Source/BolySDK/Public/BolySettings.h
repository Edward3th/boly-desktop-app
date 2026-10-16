#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "BolySettings.generated.h"

// Configuracion del SDK: Project Settings > Plugins > Boly SDK.
// Se guarda en Config/DefaultGame.ini.
UCLASS(Config = Game, DefaultConfig, meta = (DisplayName = "Boly SDK"))
class BOLYSDK_API UBolySettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	// Iniciar el SDK en builds. Desactivalo solo en builds que no se publican
	// en Boly: con el SDK activo, un build sin -key se cierra.
	UPROPERTY(Config, EditAnywhere, Category = "Boly")
	bool bEnabledInBuilds = true;

	// Nivel que se abre cuando la sesion queda lista. Vacio = no abrir nada.
	// Equivale al flujo AuthMap -> MainLevel del ValidationSubsystem.
	UPROPERTY(Config, EditAnywhere, Category = "Boly", meta = (AllowedClasses = "/Script/Engine.World"))
	FSoftObjectPath LevelOnReady;

	virtual FName GetCategoryName() const override { return TEXT("Plugins"); }
};
